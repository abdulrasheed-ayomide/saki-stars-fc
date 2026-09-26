import { Router } from 'express';
import { z } from 'zod';
import { Player, Team, Match, User, ScoutingReport } from '../../models/index.js';
import { POSITIONS, PLAYER_STATUSES } from '../../models/Player.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, mediaInput, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { containsRegex, ageOn } from '../../utils/text.js';
import { idOrSlugFilter, idString } from '../../utils/ids.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { publicPlayer, staffPlayer, matchSummary } from '../../serializers/index.js';
import { playerStats, withAdjustments } from '../../services/stats.service.js';
import { canAccessPlayer, assertAccess, playerScopeFilter, scopeOf } from '../../auth/access.js';
import { MATCH_POPULATE } from '../football/teams.routes.js';
import { currentSeason } from '../football/seasons.routes.js';

const TEAM_POP = { path: 'team', select: 'name shortName slug logo isClubTeam' };
const PUBLIC_FILTER = { showOnWebsite: true, deletedAt: null, status: { $in: ['active', 'injured', 'on_loan'] } };

/**
 * The ONE rule for "this player is on the public website", used by the list AND the profile
 * so they can never disagree. A player is public when marked showOnWebsite, not deleted, in an
 * active-type status, and either not yet assigned to a team or on a club team that is not
 * archived. (Previously the list also required an *active club team*, so players saved without
 * a team opened by link but never appeared on /players.)
 */
export async function publicPlayerFilter({ team } = {}) {
  const clubTeams = (await Team.find({ isClubTeam: true, status: { $ne: 'archived' } }).select('_id').lean()).map((t) => String(t._id));
  let teamRule;
  if (!team) teamRule = { $or: [{ team: null }, { team: { $in: clubTeams } }] };
  else if (clubTeams.includes(String(team))) teamRule = { team };
  else teamRule = { _id: null }; // an opponent or archived team: no public players
  return { $and: [PUBLIC_FILTER, teamRule] };
}

export function createPlayerRouters({ auth, audit, config, media, upload, limiters }) {
  const pub = Router();
  const admin = Router();

  // ---- Public ------------------------------------------------------------------------
  pub.get(
    '/',
    validate({ query: z.object({ team: objectId.optional(), position: z.enum(POSITIONS).optional(), q: z.string().max(100).optional(), featured: z.enum(['true']).optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { team, position, q, featured } = req.valid.query;
      const filter = await publicPlayerFilter({ team });
      if (position) filter.$and.push({ position });
      if (featured) filter.$and.push({ featured: true });
      if (q) {
        const rx = containsRegex(q);
        // Hidden full names of minors are not searchable by surname.
        filter.$and.push({ $or: [{ firstName: rx }, { knownAs: rx }, { lastName: rx, hideFullNamePublicly: { $ne: true } }] });
      }
      const paging = getPaging(req.valid.query, { defaultLimit: 48, maxLimit: 100 });
      const result = await findPaged(Player, filter, paging, (qq) => qq.sort({ jerseyNumber: 1, lastName: 1 }).populate(TEAM_POP));
      res.json({ data: { ...result, items: result.items.map((p) => publicPlayer(p)) } });
    },
  );

  pub.get('/:id', async (req, res) => {
    const filter = await publicPlayerFilter();
    filter.$and.push(idOrSlugFilter(req.params.id));
    const player = await Player.findOne(filter).populate(TEAM_POP).lean();
    if (!player) throw AppError.notFound('Player not found.');
    const season = await currentSeason();
    const [career, seasonStats, recent] = await Promise.all([
      playerStats([player._id]),
      season ? playerStats([player._id], { season: season._id }) : null,
      Match.find({
        status: 'completed',
        deletedAt: null,
        $or: [{ 'lineups.home.player': player._id }, { 'lineups.away.player': player._id }, { 'events.player': player._id }],
      })
        .sort({ kickoffAt: -1 })
        .limit(5)
        .populate(MATCH_POPULATE)
        .lean(),
    ]);
    res.json({
      data: {
        ...publicPlayer(player),
        stats: {
          career: withAdjustments(career.get(idString(player._id)), player),
          season: seasonStats ? { season: { id: idString(season._id), name: season.name }, ...seasonStats.get(idString(player._id)) } : null,
        },
        recentMatches: recent.map(matchSummary),
      },
    });
  });

  // ---- Admin -------------------------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff);

  const baseSchema = {
    firstName: z.string().trim().min(1, 'Enter a first name.').max(60),
    lastName: z.string().trim().min(1, 'Enter a last name.').max(60),
    knownAs: z.string().trim().max(60).optional().default(''),
    photo: mediaInput(config),
    position: z.enum(POSITIONS),
    detailedPosition: z.string().trim().max(60).optional().default(''),
    jerseyNumber: z.number().int().min(1).max(99).nullable().optional(),
    team: objectId.nullable().optional(),
    nationality: z.string().trim().max(60).optional().default(''),
    bio: z.string().trim().max(4000).optional().default(''),
    preferredFoot: z.enum(['left', 'right', 'both', '']).optional().default(''),
    featured: z.boolean().optional().default(false),
    showOnWebsite: z.boolean().optional().default(true),
    status: z.enum(PLAYER_STATUSES).optional().default('active'),
    joinedAt: z.coerce.date().nullable().optional(),
    // Left undefined when not sent: minors then default to showing the minimum publicly.
    hidePhotoPublicly: z.boolean().optional(),
    hideFullNamePublicly: z.boolean().optional(),
    statAdjustments: z
      .object({ appearances: z.number().int().min(0).max(2000), goals: z.number().int().min(0).max(2000), assists: z.number().int().min(0).max(2000) })
      .optional(),
  };
  const restrictedSchema = z
    .object({
      dateOfBirth: z.coerce.date().nullable().optional(),
      phone: z.string().trim().max(40).optional().default(''),
      email: z.string().trim().max(254).optional().default(''),
      address: z.string().trim().max(400).optional().default(''),
      emergencyContact: z.object({ name: z.string().trim().max(120), relationship: z.string().trim().max(60), phone: z.string().trim().max(40) }).partial().prefault({}),
      guardian: z.object({ name: z.string().trim().max(120), relationship: z.string().trim().max(60), phone: z.string().trim().max(40), email: z.string().trim().max(254) }).partial().prefault({}),
      internalNotes: z.string().trim().max(5000).optional().default(''),
    })
    .optional();
  const sensitiveSchema = z.object({ nationalId: z.string().trim().max(60).optional().default(''), medicalNotes: z.string().trim().max(5000).optional().default('') }).optional();

  const createSchema = z.object({ ...baseSchema, restricted: restrictedSchema, sensitive: sensitiveSchema });
  const updateSchema = createSchema;

  function viewFor(req, player, extra = {}) {
    return staffPlayer(player, {
      includeRestricted: canAccessPlayer(req.auth, 'players.sensitive.view', player),
      includeSensitive: canAccessPlayer(req.auth, 'players.highly_sensitive.view', player),
      ...extra,
    });
  }

  admin.get(
    '/',
    auth.requirePermission('players.view', 'players.edit'),
    validate({ query: z.object({ team: objectId.optional(), position: z.enum(POSITIONS).optional(), status: z.enum(PLAYER_STATUSES).optional(), q: z.string().max(100).optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { team, position, status, q } = req.valid.query;
      const permission = scopeOf(req.auth, 'players.view') ? 'players.view' : 'players.edit';
      const filter = { deletedAt: null, ...playerScopeFilter(req.auth, permission) };
      if (team) filter.team = filter.team ? { $in: (filter.team.$in || []).filter((t) => t === team) } : team;
      if (position) filter.position = position;
      if (status) filter.status = status;
      if (q) {
        const rx = containsRegex(q);
        filter.$or = [{ firstName: rx }, { lastName: rx }, { knownAs: rx }];
      }
      const paging = getPaging(req.valid.query, { defaultLimit: 50 });
      const result = await findPaged(Player, filter, paging, (qq) => qq.sort({ lastName: 1, firstName: 1 }).populate(TEAM_POP));
      res.json({ data: { ...result, items: result.items.map((p) => staffPlayer(p)) } });
    },
  );

  admin.get('/:id', auth.requirePermission('players.view', 'players.edit'), validate({ params: idParams }), async (req, res) => {
    const player = await Player.findOne({ _id: req.valid.params.id, deletedAt: null }).populate(TEAM_POP).lean();
    if (!player) throw AppError.notFound('Player not found.');
    assertAccess(canAccessPlayer(req.auth, 'players.view', player) || canAccessPlayer(req.auth, 'players.edit', player));
    const stats = await playerStats([player._id]);
    const view = viewFor(req, player, { stats: withAdjustments(stats.get(idString(player._id)), player) });
    if (view.restricted || view.sensitive) {
      await audit(req, {
        action: 'player.sensitive_viewed',
        entityType: 'Player',
        entityId: player._id,
        metadata: { restricted: Boolean(view.restricted), highlySensitive: Boolean(view.sensitive) },
      });
    }
    view.canEdit = canAccessPlayer(req.auth, 'players.edit', player);
    view.linkedUser = player.user ? await User.findById(player.user).select('email status').lean().then((u) => (u ? { email: u.email, status: u.status } : null)) : null;
    if (scopeOf(req.auth, 'scouting.view') === 'all') view.scoutingReportCount = await ScoutingReport.countDocuments({ 'subject.player': player._id });
    res.json({ data: view });
  });

  async function checkTeam(teamId) {
    if (!teamId) return;
    const team = await Team.findById(teamId).lean();
    if (!team || !team.isClubTeam) throw AppError.validation([{ path: 'team', message: 'Choose one of the club’s teams.' }]);
    return team;
  }

  function applyPrivate(doc, req, body, player) {
    if (body.restricted && canAccessPlayer(req.auth, 'players.sensitive.view', player)) {
      const r = body.restricted;
      doc.restricted = doc.restricted || {};
      for (const key of ['dateOfBirth', 'phone', 'email', 'address', 'internalNotes']) if (r[key] !== undefined) doc.restricted[key] = r[key];
      doc.restricted.emergencyContact = { ...(doc.restricted.emergencyContact || {}), ...r.emergencyContact };
      doc.restricted.guardian = { ...(doc.restricted.guardian?.toObject?.() ?? doc.restricted.guardian ?? {}), ...r.guardian };
      const age = ageOn(r.dateOfBirth);
      if (age !== null) doc.isMinor = age < 18;
    }
    if (body.sensitive && canAccessPlayer(req.auth, 'players.highly_sensitive.view', player)) {
      doc.sensitive = { ...(doc.sensitive?.toObject?.() ?? doc.sensitive ?? {}), ...body.sensitive };
    }
  }

  admin.post('/', auth.requirePermission('players.create'), validate({ body: createSchema }), async (req, res) => {
    const body = req.valid.body;
    await checkTeam(body.team);
    const { restricted, sensitive, ...rest } = body;
    const doc = new Player({
      ...rest,
      createdBy: req.auth.user._id,
    });
    applyPrivate(doc, req, body, { team: body.team });
    if (doc.isMinor && body.hideFullNamePublicly === undefined) doc.hideFullNamePublicly = true;
    await doc.save();
    await audit(req, { action: 'player.created', entityType: 'Player', entityId: doc._id, metadata: { name: `${doc.firstName} ${doc.lastName}`, team: body.team } });
    res.status(201).json({ data: viewFor(req, (await doc.populate(TEAM_POP)).toObject()) });
  });

  admin.put('/:id', auth.requirePermission('players.edit'), validate({ params: idParams, body: updateSchema }), async (req, res) => {
    const player = await Player.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!player) throw AppError.notFound('Player not found.');
    assertAccess(canAccessPlayer(req.auth, 'players.edit', player.toObject()));
    const body = req.valid.body;
    if (body.team && String(body.team) !== String(player.team)) {
      // Moving a player to another team needs edit access to the destination too.
      assertAccess(canAccessPlayer(req.auth, 'players.edit', { ...player.toObject(), team: body.team }), 'You can only move players into teams assigned to you.');
    }
    await checkTeam(body.team);
    if (body.jerseyNumber && body.team) {
      const clash = await Player.findOne({ _id: { $ne: player._id }, team: body.team, jerseyNumber: body.jerseyNumber, deletedAt: null, status: { $nin: ['released', 'archived'] } }).lean();
      if (clash) throw AppError.validation([{ path: 'jerseyNumber', message: `Number ${body.jerseyNumber} is already worn by ${clash.firstName} ${clash.lastName}.` }]);
    }
    const { restricted, sensitive, ...rest } = body;
    const before = { team: idString(player.team), position: player.position, jerseyNumber: player.jerseyNumber, status: player.status };
    const oldPhoto = player.photo?.publicId;
    if (!scopeOf(req.auth, 'players.create') && rest.statAdjustments) delete rest.statAdjustments; // official historical totals: club-wide editors only
    for (const key of Object.keys(rest)) if (rest[key] === undefined) delete rest[key];
    player.set(rest);
    applyPrivate(player, req, body, player.toObject());
    await player.save();
    if (oldPhoto && oldPhoto !== body.photo?.publicId) await media.destroy({ publicId: oldPhoto });
    const after = { team: idString(player.team), position: player.position, jerseyNumber: player.jerseyNumber, status: player.status };
    await audit(req, {
      action: 'player.updated',
      entityType: 'Player',
      entityId: player._id,
      metadata: { before, after, restrictedChanged: Boolean(restricted), sensitiveChanged: Boolean(sensitive) },
    });
    res.json({ data: viewFor(req, (await player.populate(TEAM_POP)).toObject()) });
  });

  // Soft delete: the football record (appearances, goals) stays in match history.
  admin.delete('/:id', auth.requirePermission('players.create'), validate({ params: idParams }), async (req, res) => {
    const player = await Player.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!player) throw AppError.notFound('Player not found.');
    player.status = 'archived';
    player.showOnWebsite = false;
    player.deletedAt = new Date();
    player.deletedBy = req.auth.user._id;
    await player.save();
    await audit(req, { action: 'player.archived', entityType: 'Player', entityId: player._id, metadata: { name: `${player.firstName} ${player.lastName}` } });
    res.json({ data: { id: idString(player._id) } });
  });

  // ---- Private documents -------------------------------------------------------------
  admin.post(
    '/:id/documents',
    auth.requirePermission('players.sensitive.view'),
    limiters.uploads,
    upload,
    validate({ params: idParams, body: z.object({ name: z.string().trim().min(2).max(150), kind: z.enum(['id', 'consent', 'medical', 'registration', 'other']).optional().default('other') }) }),
    async (req, res) => {
      const player = await Player.findOne({ _id: req.valid.params.id, deletedAt: null });
      if (!player) throw AppError.notFound('Player not found.');
      assertAccess(canAccessPlayer(req.auth, 'players.sensitive.view', player.toObject()));
      if (['id', 'medical'].includes(req.valid.body.kind)) {
        assertAccess(canAccessPlayer(req.auth, 'players.highly_sensitive.view', player.toObject()), 'ID and medical documents need highly-sensitive access.');
      }
      const file = await media.upload(req.file, { kind: 'document', folder: 'documents', isPrivate: true });
      player.restricted.documents.push({ name: req.valid.body.name, kind: req.valid.body.kind, file, uploadedBy: req.auth.user._id });
      await player.save();
      const doc = player.restricted.documents.at(-1);
      await audit(req, { action: 'player.document_uploaded', entityType: 'Player', entityId: player._id, metadata: { document: doc._id, kind: doc.kind } });
      res.status(201).json({ data: { id: idString(doc._id), name: doc.name, kind: doc.kind, uploadedAt: doc.uploadedAt } });
    },
  );

  admin.get('/:id/documents/:docId', auth.requirePermission('players.sensitive.view'), validate({ params: z.object({ id: objectId, docId: objectId }) }), async (req, res) => {
    const player = await Player.findOne({ _id: req.valid.params.id, deletedAt: null }).lean();
    if (!player) throw AppError.notFound('Player not found.');
    assertAccess(canAccessPlayer(req.auth, 'players.sensitive.view', player));
    const doc = (player.restricted?.documents || []).find((d) => idString(d._id) === req.valid.params.docId);
    if (!doc) throw AppError.notFound('Document not found.');
    if (['id', 'medical'].includes(doc.kind)) assertAccess(canAccessPlayer(req.auth, 'players.highly_sensitive.view', player));
    await audit(req, { action: 'player.document_opened', entityType: 'Player', entityId: player._id, metadata: { document: doc._id, kind: doc.kind } });
    res.json({ data: { url: media.privateUrl(doc.file), expiresInSeconds: 300 } });
  });

  admin.delete('/:id/documents/:docId', auth.requirePermission('players.sensitive.view'), validate({ params: z.object({ id: objectId, docId: objectId }) }), async (req, res) => {
    const player = await Player.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!player) throw AppError.notFound('Player not found.');
    assertAccess(canAccessPlayer(req.auth, 'players.edit', player.toObject()) && canAccessPlayer(req.auth, 'players.sensitive.view', player.toObject()));
    const doc = player.restricted.documents.id(req.valid.params.docId);
    if (!doc) throw AppError.notFound('Document not found.');
    if (['id', 'medical'].includes(doc.kind)) assertAccess(canAccessPlayer(req.auth, 'players.highly_sensitive.view', player.toObject()));
    const file = doc.file;
    doc.deleteOne();
    await player.save();
    await media.destroy(file);
    await audit(req, { action: 'player.document_deleted', entityType: 'Player', entityId: player._id, metadata: { document: req.valid.params.docId } });
    res.json({ data: { id: req.valid.params.docId } });
  });

  return { pub, admin };
}
