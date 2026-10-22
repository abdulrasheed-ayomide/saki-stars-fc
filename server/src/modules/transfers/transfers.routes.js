import { Router } from 'express';
import { z } from 'zod';
import { Transfer, Player, Team, Season, News, nextTransferReference } from '../../models/index.js';
import {
  TRANSFER_DIRECTIONS,
  TRANSFER_TYPES,
  TRANSFER_WINDOWS,
  TRANSFER_STATUSES,
  OPEN_TRANSFER_STATUSES,
  TRANSFER_DOCUMENT_KINDS,
} from '../../models/Transfer.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { containsRegex, uniqueSlug } from '../../utils/text.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { canAccessPlayer, has } from '../../auth/access.js';
import { privateFileInfo, publicPlayerName } from '../../serializers/index.js';
import { getSettings } from '../../services/settings.service.js';

/**
 * The only allowed status changes. Each action names the statuses it may start from, the
 * status it leads to and the permission it needs. Anything else is refused by the server,
 * whatever the request says.
 */
export const TRANSFER_ACTIONS = {
  submit: { from: ['draft'], to: 'pending_approval', permission: 'transfers.manage', label: 'submitted for approval' },
  withdraw: { from: ['pending_approval'], to: 'draft', permission: 'transfers.manage', label: 'withdrawn to draft' },
  approve: { from: ['pending_approval'], to: 'approved', permission: 'transfers.approve', label: 'approved' },
  reject: { from: ['pending_approval'], to: 'rejected', permission: 'transfers.approve', label: 'rejected', noteRequired: true },
  reopen: { from: ['rejected'], to: 'draft', permission: 'transfers.manage', label: 'reopened as a draft' },
  start: { from: ['approved'], to: 'in_progress', permission: 'transfers.approve', label: 'marked in progress' },
  complete: { from: ['in_progress'], to: 'completed', permission: 'transfers.approve', label: 'completed' },
  // Cancelling a draft or a request awaiting approval is the requester's call; cancelling
  // something already approved needs approval rights and a reason.
  cancel: { from: ['draft', 'pending_approval'], to: 'cancelled', permission: 'transfers.manage', label: 'cancelled' },
  cancelApproved: { from: ['approved', 'in_progress'], to: 'cancelled', permission: 'transfers.approve', label: 'cancelled', noteRequired: true },
};

const ACTION_NAMES = ['submit', 'withdraw', 'approve', 'reject', 'reopen', 'start', 'complete', 'cancel'];
const AUDIT_ACTIONS = {
  submit: 'transfer.submitted',
  withdraw: 'transfer.withdrawn',
  approve: 'transfer.approved',
  reject: 'transfer.rejected',
  reopen: 'transfer.reopened',
  start: 'transfer.started',
  complete: 'transfer.completed',
  cancel: 'transfer.cancelled',
};

const PLAYER_POP = { path: 'player', select: 'firstName lastName knownAs slug position jerseyNumber squad status team joinedAt deletedAt hideFullNamePublicly' };
const LIST_POP = [PLAYER_POP, { path: 'season', select: 'name' }, { path: 'clubTeam', select: 'name shortName slug' }];

const openKeyFor = (player, direction, status) => (player && OPEN_TRANSFER_STATUSES.includes(status) ? `${idString(player)}:${direction}` : undefined);
const isDuplicateOpen = (err) => err?.code === 11000 && /openKey/.test(String(err.message || JSON.stringify(err.keyPattern || {})));

function actorName(req) {
  return req.auth.user.name || req.auth.user.email || '';
}

function historyEntry(req, action, extra = {}) {
  return { at: new Date(), by: req.auth.user._id, byName: actorName(req), action, ...extra };
}

/**
 * What a completed transfer would change on the player record, if staff ask for it.
 * Nothing is deleted; the player stays in match history and can be edited back.
 */
export function playerUpdateFor(transfer, player) {
  if (!player) return null;
  const set = {};
  if (transfer.direction === 'outgoing') {
    set.status = transfer.type === 'loan' ? 'on_loan' : 'released';
  } else {
    set.status = 'active';
    if (!player.joinedAt && transfer.type !== 'loan_return') set.joinedAt = transfer.effectiveDate || new Date();
  }
  const changes = {};
  for (const [key, value] of Object.entries(set)) {
    const before = player[key] ?? null;
    if (String(before) !== String(value)) changes[key] = { from: before, to: value };
  }
  return Object.keys(changes).length ? changes : null;
}

function playerView(p) {
  if (!p || !p._id) return p ? { id: idString(p) } : null;
  return {
    id: idString(p._id),
    name: [p.firstName, p.lastName].filter(Boolean).join(' '),
    slug: p.slug,
    position: p.position || '',
    jerseyNumber: p.jerseyNumber ?? null,
    squad: p.squad || null,
    status: p.status,
    archived: Boolean(p.deletedAt),
  };
}

function userView(ref, name) {
  if (!ref) return null;
  return { id: idString(ref._id ?? ref), name: name || ref.name || '' };
}

/** Staff-only shapes. The list never includes private notes, documents or history. */
export function transferSummaryView(t) {
  return {
    id: idString(t._id),
    reference: t.reference,
    direction: t.direction,
    player: playerView(t.player),
    playerName: t.playerName,
    fromClub: t.fromClub,
    toClub: t.toClub,
    type: t.type,
    season: t.season && t.season._id ? { id: idString(t.season._id), name: t.season.name } : t.season ? { id: idString(t.season) } : null,
    window: t.window || '',
    proposedDate: t.proposedDate || null,
    effectiveDate: t.effectiveDate || null,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function transferDetailView(t, req) {
  const external = t.externalPlayer || {};
  return {
    ...transferSummaryView(t),
    externalPlayer: {
      firstName: external.firstName || '',
      lastName: external.lastName || '',
      position: external.position || '',
      nationality: external.nationality || '',
      dateOfBirth: external.dateOfBirth || null,
    },
    clubTeam: t.clubTeam && t.clubTeam._id ? { id: idString(t.clubTeam._id), name: t.clubTeam.name } : t.clubTeam ? { id: idString(t.clubTeam) } : null,
    loanEndDate: t.loanEndDate || null,
    reason: t.reason || '',
    internalNotes: t.internalNotes || '',
    documents: (t.documents || []).map((d) => ({
      id: idString(d._id),
      name: d.name,
      kind: d.kind,
      uploadedAt: d.uploadedAt,
      file: privateFileInfo(d.file), // never the URL: opened through a short-lived signed link
    })),
    submittedAt: t.submittedAt || null,
    approval: t.approval?.decision
      ? { decision: t.approval.decision, by: userView(t.approval.by, t.approval.byName), at: t.approval.at, note: t.approval.note || '' }
      : null,
    completedAt: t.completedAt || null,
    cancelledAt: t.cancelledAt || null,
    announcement: t.announcement?.news ? { newsId: idString(t.announcement.news), at: t.announcement.at } : null,
    history: (t.history || [])
      .map((h) => ({
        id: idString(h._id),
        at: h.at,
        by: userView(h.by, h.byName),
        action: h.action,
        fromStatus: h.fromStatus || '',
        toStatus: h.toStatus || '',
        note: h.note || '',
        changes: h.changes ?? null,
      }))
      .reverse(),
    createdBy: userView(t.createdBy, t.history?.[0]?.byName),
    updatedBy: t.updatedBy ? userView(t.updatedBy, [...(t.history || [])].reverse().find((h) => idString(h.by) === idString(t.updatedBy))?.byName) : null,
    // What this person may do next (the server checks again on every request).
    allowedActions: allowedActions(req, t),
    canEdit: t.status === 'draft' && has(req.auth, 'transfers.manage'),
    canManageDocuments: t.status !== 'cancelled' && has(req.auth, 'transfers.manage'),
    canDraftAnnouncement: t.status === 'completed' && !t.announcement?.at && has(req.auth, 'news.create'),
    playerUpdatePreview: t.status === 'in_progress' && t.player && t.player._id ? playerUpdateFor(t, t.player) : null,
    canUpdatePlayer: Boolean(t.player && t.player._id && canAccessPlayer(req.auth, 'players.edit', t.player)),
  };
}

function resolveAction(name, status) {
  if (name === 'cancel' && TRANSFER_ACTIONS.cancelApproved.from.includes(status)) return TRANSFER_ACTIONS.cancelApproved;
  return TRANSFER_ACTIONS[name];
}

function selfApprovalBlocked(req, t) {
  return !req.auth.isDirector && t.submittedBy && idString(t.submittedBy) === idString(req.auth.user._id);
}

function allowedActions(req, t) {
  return ACTION_NAMES.filter((name) => {
    const a = resolveAction(name, t.status);
    if (!a || !a.from.includes(t.status) || !has(req.auth, a.permission)) return false;
    if (name === 'approve' && selfApprovalBlocked(req, t)) return false;
    return true;
  });
}

export function createTransfersRouter({ auth, audit, media, upload, limiters }) {
  const router = Router();
  // Private records: staff only, and every route below also checks a transfers permission.
  router.use(auth.requireAuth, auth.requireStaff);

  const optionalDate = z.coerce.date().nullable().optional();
  const bodySchema = z
    .object({
      direction: z.enum(TRANSFER_DIRECTIONS),
      player: objectId.nullable().optional(),
      externalPlayer: z
        .object({
          firstName: z.string().trim().max(60).optional().default(''),
          lastName: z.string().trim().max(60).optional().default(''),
          position: z.string().trim().max(60).optional().default(''),
          nationality: z.string().trim().max(60).optional().default(''),
          dateOfBirth: optionalDate,
        })
        .optional(),
      // The other club: where an incoming player comes from, or where an outgoing player goes.
      otherClub: z.string().trim().min(2, 'Enter the other club’s name.').max(120),
      clubTeam: objectId.nullable().optional(),
      type: z.enum(TRANSFER_TYPES),
      season: objectId.nullable().optional(),
      window: z.enum([...TRANSFER_WINDOWS, '']).optional().default(''),
      proposedDate: optionalDate,
      effectiveDate: optionalDate,
      loanEndDate: optionalDate,
      reason: z.string().trim().max(2000).optional().default(''),
      internalNotes: z.string().trim().max(5000).optional().default(''),
    })
    .superRefine((v, ctx) => {
      if (v.direction === 'outgoing' && !v.player) ctx.addIssue({ code: 'custom', path: ['player'], message: 'Choose the club player who is leaving.' });
      if (v.direction === 'incoming' && !v.player && !(v.externalPlayer?.firstName && v.externalPlayer?.lastName)) {
        ctx.addIssue({ code: 'custom', path: ['externalPlayer.firstName'], message: 'Choose an existing player, or enter the new player’s first and last name.' });
      }
      if (v.loanEndDate && v.type !== 'loan') ctx.addIssue({ code: 'custom', path: ['loanEndDate'], message: 'A loan end date is only used for loans.' });
      const start = v.effectiveDate || v.proposedDate;
      if (v.loanEndDate && start && v.loanEndDate <= start) ctx.addIssue({ code: 'custom', path: ['loanEndDate'], message: 'The loan must end after it starts.' });
    });

  async function load(id, { populate = true } = {}) {
    const q = Transfer.findById(id);
    if (populate) q.populate([...LIST_POP, { path: 'createdBy', select: 'name' }, { path: 'approval.by', select: 'name' }]);
    const t = await q.lean();
    if (!t) throw AppError.notFound('Transfer not found.');
    return t;
  }

  /** Checks references and turns the request into the stored fields (only known fields). */
  async function toFields(body) {
    const [player, team, season, settings] = await Promise.all([
      body.player ? Player.findOne({ _id: body.player, deletedAt: null }).lean() : null,
      body.clubTeam ? Team.findById(body.clubTeam).lean() : null,
      body.season ? Season.exists({ _id: body.season }) : null,
      getSettings(),
    ]);
    const problems = [];
    if (body.player && !player) problems.push({ path: 'player', message: 'Player not found.' });
    if (body.clubTeam && (!team || !team.isClubTeam)) problems.push({ path: 'clubTeam', message: 'Choose one of the club’s teams.' });
    if (body.season && !season) problems.push({ path: 'season', message: 'Season not found.' });
    if (problems.length) throw AppError.validation(problems);

    const clubName = settings?.name || 'Saki Stars FC';
    const external = player ? {} : body.externalPlayer || {};
    return {
      direction: body.direction,
      player: player ? player._id : null,
      externalPlayer: {
        firstName: external.firstName || '',
        lastName: external.lastName || '',
        position: external.position || '',
        nationality: external.nationality || '',
        dateOfBirth: external.dateOfBirth || null,
      },
      playerName: player ? [player.firstName, player.lastName].filter(Boolean).join(' ') : `${external.firstName} ${external.lastName}`.trim(),
      fromClub: body.direction === 'incoming' ? body.otherClub : clubName,
      toClub: body.direction === 'incoming' ? clubName : body.otherClub,
      clubTeam: body.clubTeam || null,
      type: body.type,
      season: body.season || null,
      window: body.window || '',
      proposedDate: body.proposedDate ?? null,
      effectiveDate: body.effectiveDate ?? null,
      loanEndDate: body.loanEndDate ?? null,
      reason: body.reason,
      internalNotes: body.internalNotes,
    };
  }

  async function openConflict(fields, excludeId) {
    if (!fields.player) return null;
    return Transfer.findOne({ player: fields.player, direction: fields.direction, status: { $in: OPEN_TRANSFER_STATUSES }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
      .select('reference')
      .lean();
  }

  function duplicateError(fields, existing) {
    const ref = existing?.reference ? ` (${existing.reference})` : '';
    return AppError.conflict(`${fields.playerName} already has an open ${fields.direction} transfer${ref}. Finish or cancel it first.`, 'TRANSFER_ALREADY_OPEN');
  }

  // ---- Read ---------------------------------------------------------------------------
  // Minimal player list for the form's picker (transfer staff may not hold players.view).
  router.get('/player-options', auth.requirePermission('transfers.manage'), async (req, res) => {
    const list = await Player.find({ deletedAt: null }).select('firstName lastName jerseyNumber squad status team').sort({ lastName: 1, firstName: 1 }).limit(2000).populate('team', 'name').lean();
    res.json({ data: list.map((p) => ({ id: idString(p._id), name: [p.firstName, p.lastName].filter(Boolean).join(' '), jerseyNumber: p.jerseyNumber ?? null, squad: p.squad || null, status: p.status, team: p.team?.name || '' })) });
  });

  router.get('/summary', auth.requirePermission('transfers.view'), async (req, res) => {
    const rows = await Transfer.aggregate([{ $group: { _id: { direction: '$direction', status: '$status' }, n: { $sum: 1 } } }]);
    const byStatus = Object.fromEntries(TRANSFER_STATUSES.map((s) => [s, 0]));
    const byDirection = { incoming: 0, outgoing: 0 };
    for (const r of rows) {
      byStatus[r._id.status] = (byStatus[r._id.status] || 0) + r.n;
      byDirection[r._id.direction] = (byDirection[r._id.direction] || 0) + r.n;
    }
    res.json({ data: { ...byDirection, byStatus, pending: byStatus.pending_approval, approved: byStatus.approved, completed: byStatus.completed, total: byDirection.incoming + byDirection.outgoing } });
  });

  router.get(
    '/',
    auth.requirePermission('transfers.view'),
    validate({
      query: z.object({
        q: z.string().trim().max(100).optional(),
        direction: z.enum(TRANSFER_DIRECTIONS).optional(),
        status: z.enum(TRANSFER_STATUSES).optional(),
        type: z.enum(TRANSFER_TYPES).optional(),
        season: objectId.optional(),
        player: objectId.optional(),
        club: z.string().trim().max(120).optional(),
        ...pagingQuery,
      }),
    }),
    async (req, res) => {
      const { q, direction, status, type, season, player, club } = req.valid.query;
      const and = [];
      if (direction) and.push({ direction });
      if (status) and.push({ status });
      if (type) and.push({ type });
      if (season) and.push({ season });
      if (player) and.push({ player });
      if (club) {
        const rx = containsRegex(club);
        and.push({ $or: [{ fromClub: rx }, { toClub: rx }] });
      }
      if (q) {
        const rx = containsRegex(q);
        and.push({ $or: [{ reference: rx }, { playerName: rx }, { fromClub: rx }, { toClub: rx }] });
      }
      const filter = and.length ? { $and: and } : {};
      const result = await findPaged(Transfer, filter, getPaging(req.valid.query, { defaultLimit: 20, maxLimit: 100 }), (qq) => qq.sort({ createdAt: -1, _id: -1 }).populate(LIST_POP));
      res.json({ data: { ...result, items: result.items.map(transferSummaryView) } });
    },
  );

  router.get('/:id', auth.requirePermission('transfers.view'), validate({ params: idParams }), async (req, res) => {
    res.json({ data: transferDetailView(await load(req.valid.params.id), req) });
  });

  // ---- Create / edit (drafts only) ---------------------------------------------------
  router.post('/', auth.requirePermission('transfers.manage'), validate({ body: bodySchema }), async (req, res) => {
    const fields = await toFields(req.valid.body);
    const existing = await openConflict(fields);
    if (existing) throw duplicateError(fields, existing);
    let created;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      try {
        created = await Transfer.create({
          ...fields,
          reference: await nextTransferReference(),
          status: 'draft',
          openKey: openKeyFor(fields.player, fields.direction, 'draft'),
          createdBy: req.auth.user._id,
          updatedBy: req.auth.user._id,
          history: [historyEntry(req, 'created', { toStatus: 'draft' })],
        });
      } catch (err) {
        // Two requests for the same player at the same moment: the unique open key wins.
        if (isDuplicateOpen(err)) throw duplicateError(fields, await openConflict(fields));
        if (err?.code !== 11000) throw err; // reference clash (e.g. imported data): take the next number
      }
    }
    if (!created) throw AppError.conflict('A transfer reference could not be assigned. Please try again.');
    await audit(req, { action: 'transfer.created', entityType: 'Transfer', entityId: created._id, metadata: { reference: created.reference, direction: created.direction, type: created.type, player: idString(created.player) } });
    res.status(201).json({ data: transferDetailView(await load(created._id), req) });
  });

  const EDITABLE = ['direction', 'player', 'externalPlayer', 'playerName', 'fromClub', 'toClub', 'clubTeam', 'type', 'season', 'window', 'proposedDate', 'effectiveDate', 'loanEndDate', 'reason', 'internalNotes'];

  router.put(
    '/:id',
    auth.requirePermission('transfers.manage'),
    validate({ params: idParams, body: bodySchema.and(z.object({ expectedUpdatedAt: z.coerce.date().optional() })) }),
    async (req, res) => {
      const current = await Transfer.findById(req.valid.params.id).lean();
      if (!current) throw AppError.notFound('Transfer not found.');
      if (current.status !== 'draft') throw AppError.conflict('Only draft transfers can be edited. Withdraw or reopen it as a draft first.', 'TRANSFER_NOT_EDITABLE');
      const fields = await toFields(req.valid.body);
      const existing = await openConflict(fields, current._id);
      if (existing) throw duplicateError(fields, existing);
      const changed = EDITABLE.filter((k) => JSON.stringify(fields[k] ?? null) !== JSON.stringify(current[k] ?? null));
      const condition = { _id: current._id, status: 'draft' };
      // Someone else saved this draft after it was opened: refuse instead of overwriting their work.
      if (req.valid.body.expectedUpdatedAt) condition.updatedAt = req.valid.body.expectedUpdatedAt;
      const openKey = openKeyFor(fields.player, fields.direction, 'draft');
      let updated;
      try {
        updated = await Transfer.findOneAndUpdate(
          condition,
          {
            $set: { ...fields, updatedBy: req.auth.user._id, ...(openKey ? { openKey } : {}) },
            ...(openKey ? {} : { $unset: { openKey: 1 } }),
            $push: { history: historyEntry(req, 'edited', { changes: { fields: changed } }) },
          },
          { new: true },
        );
      } catch (err) {
        if (isDuplicateOpen(err)) throw duplicateError(fields, await openConflict(fields, current._id));
        throw err;
      }
      if (!updated) throw AppError.conflict('This transfer was changed by someone else. Reload it to see the latest version.', 'TRANSFER_CHANGED');
      await audit(req, { action: 'transfer.updated', entityType: 'Transfer', entityId: current._id, metadata: { reference: current.reference, fields: changed } });
      res.json({ data: transferDetailView(await load(current._id), req) });
    },
  );

  // ---- Workflow ---------------------------------------------------------------------
  router.post(
    '/:id/actions/:action',
    auth.requirePermission('transfers.manage', 'transfers.approve'),
    validate({
      params: z.object({ id: objectId, action: z.enum(ACTION_NAMES) }),
      body: z
        .object({
          note: z.string().trim().max(2000).optional().default(''),
          effectiveDate: optionalDate,
          updatePlayer: z.boolean().optional().default(false),
        })
        .prefault({}),
    }),
    async (req, res) => {
      const { id, action: name } = req.valid.params;
      const body = req.valid.body;
      const current = await Transfer.findById(id).populate(PLAYER_POP).lean();
      if (!current) throw AppError.notFound('Transfer not found.');
      const action = resolveAction(name, current.status);
      if (!action.from.includes(current.status)) {
        throw AppError.conflict(`A ${current.status.replace(/_/g, ' ')} transfer cannot be ${action.label}.`, 'INVALID_TRANSITION');
      }
      if (!has(req.auth, action.permission)) throw AppError.forbidden('Your role cannot do this step of the transfer.');
      if (name === 'approve' && selfApprovalBlocked(req, current)) {
        throw AppError.forbidden('Someone other than the person who submitted this transfer must approve it.', 'SELF_APPROVAL');
      }
      if (action.noteRequired && !body.note) throw AppError.validation([{ path: 'note', message: 'Give a reason.' }]);

      const now = new Date();
      const set = { status: action.to, updatedBy: req.auth.user._id };
      if (name === 'submit') Object.assign(set, { submittedBy: req.auth.user._id, submittedAt: now, approval: { decision: null, by: null, byName: '', at: null, note: '' } });
      if (name === 'approve' || name === 'reject') {
        set.approval = { decision: name === 'approve' ? 'approved' : 'rejected', by: req.auth.user._id, byName: actorName(req), at: now, note: body.note };
      }
      let playerChanges = null;
      if (name === 'complete') {
        set.effectiveDate = body.effectiveDate || current.effectiveDate || now;
        set.completedBy = req.auth.user._id;
        set.completedAt = now;
        if (body.updatePlayer) {
          if (!current.player?._id) throw AppError.validation([{ path: 'updatePlayer', message: 'Link this transfer to a player record first.' }]);
          if (!canAccessPlayer(req.auth, 'players.edit', current.player)) throw AppError.forbidden('Updating the player record also needs permission to edit this player.');
          playerChanges = playerUpdateFor({ ...current, effectiveDate: set.effectiveDate }, current.player);
        }
      }
      if (action.to === 'cancelled') Object.assign(set, { cancelledBy: req.auth.user._id, cancelledAt: now });
      const openKey = openKeyFor(current.player?._id, current.direction, action.to);
      if (openKey) set.openKey = openKey;

      let updated;
      try {
        // Only succeeds if nobody else changed the status in the meantime (no double approvals).
        updated = await Transfer.findOneAndUpdate(
          { _id: id, status: current.status },
          {
            $set: set,
            ...(openKey ? {} : { $unset: { openKey: 1 } }),
            $push: { history: historyEntry(req, name, { fromStatus: current.status, toStatus: action.to, note: body.note }) },
          },
          { new: true },
        );
      } catch (err) {
        if (isDuplicateOpen(err)) throw duplicateError(current, await openConflict({ player: current.player?._id, direction: current.direction }, current._id));
        throw err;
      }
      if (!updated) throw AppError.conflict('This transfer was updated by someone else just now. Reload it to see its current status.', 'TRANSFER_CHANGED');
      await audit(req, {
        action: AUDIT_ACTIONS[name],
        entityType: 'Transfer',
        entityId: id,
        metadata: { reference: current.reference, from: current.status, to: action.to },
      });

      if (playerChanges) {
        const $set = Object.fromEntries(Object.entries(playerChanges).map(([k, v]) => [k, v.to]));
        await Player.updateOne({ _id: current.player._id, deletedAt: null }, { $set });
        await Transfer.updateOne({ _id: id }, { $push: { history: historyEntry(req, 'player_updated', { changes: playerChanges }) } });
        await audit(req, { action: 'transfer.player_record_updated', entityType: 'Player', entityId: current.player._id, metadata: { reference: current.reference, changes: playerChanges } });
      }
      res.json({ data: transferDetailView(await load(id), req) });
    },
  );

  // Links a transfer to a player record (e.g. once an incoming player has been registered).
  router.patch(
    '/:id/player',
    auth.requirePermission('transfers.manage'),
    validate({ params: idParams, body: z.object({ player: objectId }) }),
    async (req, res) => {
      const t = await Transfer.findById(req.valid.params.id).lean();
      if (!t) throw AppError.notFound('Transfer not found.');
      if (t.player) throw AppError.conflict('This transfer is already linked to a player.');
      if (t.status === 'cancelled') throw AppError.conflict('Cancelled transfers cannot be changed.');
      const player = await Player.findOne({ _id: req.valid.body.player, deletedAt: null }).lean();
      if (!player) throw AppError.validation([{ path: 'player', message: 'Player not found.' }]);
      const openKey = openKeyFor(player._id, t.direction, t.status);
      if (openKey && (await openConflict({ player: player._id, direction: t.direction }, t._id))) throw duplicateError({ playerName: `${player.firstName} ${player.lastName}`, direction: t.direction }, await openConflict({ player: player._id, direction: t.direction }, t._id));
      let updated;
      try {
        updated = await Transfer.findOneAndUpdate(
          { _id: t._id, player: null },
          { $set: { player: player._id, updatedBy: req.auth.user._id, ...(openKey ? { openKey } : {}) }, $push: { history: historyEntry(req, 'player_linked', { note: `${player.firstName} ${player.lastName}` }) } },
          { new: true },
        );
      } catch (err) {
        if (isDuplicateOpen(err)) throw AppError.conflict('This player already has an open transfer in this direction.', 'TRANSFER_ALREADY_OPEN');
        throw err;
      }
      if (!updated) throw AppError.conflict('This transfer was linked by someone else just now.');
      await audit(req, { action: 'transfer.player_linked', entityType: 'Transfer', entityId: t._id, metadata: { reference: t.reference, player: idString(player._id) } });
      res.json({ data: transferDetailView(await load(t._id), req) });
    },
  );

  // ---- Private documents (same storage as player documents: Cloudinary "private" delivery) ----
  router.post(
    '/:id/documents',
    auth.requirePermission('transfers.manage'),
    limiters.uploads,
    upload,
    validate({ params: idParams, body: z.object({ name: z.string().trim().min(2, 'Name the document.').max(150), kind: z.enum(TRANSFER_DOCUMENT_KINDS).optional().default('other') }) }),
    async (req, res) => {
      const t = await Transfer.findById(req.valid.params.id).select('status reference documents').lean();
      if (!t) throw AppError.notFound('Transfer not found.');
      if (t.status === 'cancelled') throw AppError.conflict('Documents cannot be added to a cancelled transfer.');
      if ((t.documents || []).length >= 30) throw AppError.conflict('A transfer can have at most 30 documents.');
      const file = await media.upload(req.file, { kind: 'document', folder: 'documents', isPrivate: true });
      const doc = { name: req.valid.body.name, kind: req.valid.body.kind, file, uploadedBy: req.auth.user._id, uploadedAt: new Date() };
      await Transfer.updateOne(
        { _id: t._id },
        { $push: { documents: doc, history: historyEntry(req, 'document_added', { note: doc.name }) }, $set: { updatedBy: req.auth.user._id } },
      );
      await audit(req, { action: 'transfer.document_uploaded', entityType: 'Transfer', entityId: t._id, metadata: { reference: t.reference, kind: doc.kind } });
      res.status(201).json({ data: transferDetailView(await load(t._id), req) });
    },
  );

  router.get('/:id/documents/:docId', auth.requirePermission('transfers.view'), validate({ params: z.object({ id: objectId, docId: objectId }) }), async (req, res) => {
    const t = await Transfer.findById(req.valid.params.id).select('reference documents').lean();
    if (!t) throw AppError.notFound('Transfer not found.');
    const doc = (t.documents || []).find((d) => idString(d._id) === req.valid.params.docId);
    if (!doc) throw AppError.notFound('Document not found.');
    await audit(req, { action: 'transfer.document_opened', entityType: 'Transfer', entityId: t._id, metadata: { reference: t.reference, document: idString(doc._id) } });
    res.json({ data: { url: media.privateUrl(doc.file), expiresInSeconds: 300 } });
  });

  router.delete('/:id/documents/:docId', auth.requirePermission('transfers.manage'), validate({ params: z.object({ id: objectId, docId: objectId }) }), async (req, res) => {
    const t = await Transfer.findById(req.valid.params.id).select('reference documents status').lean();
    if (!t) throw AppError.notFound('Transfer not found.');
    if (t.status === 'cancelled') throw AppError.conflict('Cancelled transfers cannot be changed.');
    const doc = (t.documents || []).find((d) => idString(d._id) === req.valid.params.docId);
    if (!doc) throw AppError.notFound('Document not found.');
    await Transfer.updateOne(
      { _id: t._id },
      { $pull: { documents: { _id: doc._id } }, $push: { history: historyEntry(req, 'document_removed', { note: doc.name }) }, $set: { updatedBy: req.auth.user._id } },
    );
    await media.destroy(doc.file);
    await audit(req, { action: 'transfer.document_deleted', entityType: 'Transfer', entityId: t._id, metadata: { reference: t.reference, document: idString(doc._id) } });
    res.json({ data: transferDetailView(await load(t._id), req) });
  });

  // ---- Announcement: an explicit request that creates an UNPUBLISHED news draft ----------
  router.post('/:id/announcement', auth.requirePermission('transfers.view'), validate({ params: idParams }), async (req, res) => {
    if (!has(req.auth, 'news.create')) throw AppError.forbidden('Drafting a news article needs permission to write news.');
    const now = new Date();
    // Claimed atomically so a double click cannot create two drafts.
    const claimed = await Transfer.findOneAndUpdate(
      { _id: req.valid.params.id, status: 'completed', 'announcement.at': null },
      { $set: { 'announcement.at': now, 'announcement.by': req.auth.user._id } },
      { new: true },
    )
      .populate(PLAYER_POP)
      .lean();
    if (!claimed) {
      const t = await Transfer.findById(req.valid.params.id).select('status announcement').lean();
      if (!t) throw AppError.notFound('Transfer not found.');
      if (t.status !== 'completed') throw AppError.conflict('Only completed transfers can be announced.');
      throw AppError.conflict('A news draft has already been created for this transfer.');
    }
    // Public-safe wording only: no notes, documents or approval details. A minor's hidden surname stays hidden.
    const name = claimed.player?._id ? publicPlayerName(claimed.player) : claimed.playerName;
    const typeWords = { permanent: 'on a permanent transfer', loan: 'on loan', loan_return: 'at the end of a loan', free: 'on a free transfer', other: '' };
    const title = `${name} joins ${claimed.toClub}`;
    const content =
      claimed.direction === 'incoming'
        ? `${claimed.toClub} is pleased to confirm that ${name} has joined the club from ${claimed.fromClub}${typeWords[claimed.type] ? ` ${typeWords[claimed.type]}` : ''}.`
        : `${name} has left ${claimed.fromClub} to join ${claimed.toClub}${typeWords[claimed.type] ? ` ${typeWords[claimed.type]}` : ''}. Everyone at the club thanks ${name} and wishes them well.`;
    let article;
    try {
      article = await News.create({
        title,
        slug: await uniqueSlug(News, title),
        excerpt: content.slice(0, 300),
        content,
        category: 'Transfers',
        relatedPlayers: claimed.player?._id ? [claimed.player._id] : [],
        author: req.auth.user._id,
        authorName: req.auth.user.name,
        status: 'draft',
        lastEditedBy: req.auth.user._id,
      });
    } catch (err) {
      await Transfer.updateOne({ _id: claimed._id }, { $set: { 'announcement.at': null, 'announcement.by': null } });
      throw err;
    }
    await Transfer.updateOne(
      { _id: claimed._id },
      { $set: { 'announcement.news': article._id }, $push: { history: historyEntry(req, 'announcement_drafted', { note: 'News draft created (not published).' }) } },
    );
    await audit(req, { action: 'transfer.announcement_drafted', entityType: 'Transfer', entityId: claimed._id, metadata: { reference: claimed.reference, news: idString(article._id) } });
    res.status(201).json({ data: { newsId: idString(article._id), transfer: transferDetailView(await load(claimed._id), req) } });
  });

  return router;
}
