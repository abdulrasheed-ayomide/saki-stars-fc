import { Router } from 'express';
import { z } from 'zod';
import { ScoutingAssignment, ScoutingReport, Player, Staff, User } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, mediaInput, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { containsRegex } from '../../utils/text.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { scopeOf, has } from '../../auth/access.js';
import { resolveGrants } from '../../auth/permissions.js';
import { playerLink, privateFileInfo } from '../../serializers/index.js';

const PLAYER_POP = { path: 'subject.player', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly position' };

function subjectView(s) {
  if (!s) return null;
  return {
    player: s.player && s.player._id ? { ...playerLink(s.player), position: s.player.position } : s.player ? { id: idString(s.player) } : null,
    name: s.name || (s.player && s.player._id ? [s.player.firstName, s.player.lastName].join(' ') : ''),
    currentClub: s.currentClub || '',
    position: s.position || s.player?.position || '',
    birthYear: s.birthYear ?? null,
    location: s.location || '',
  };
}

function assignmentView(a) {
  return {
    id: idString(a._id),
    scout: a.scout && a.scout._id ? { id: idString(a.scout._id), name: a.scout.name } : { id: idString(a.scout) },
    subject: subjectView(a.subject),
    instructions: a.instructions,
    dueDate: a.dueDate,
    status: a.status,
    assignedBy: a.assignedBy?.name || '',
    createdAt: a.createdAt,
  };
}

function reportView(r, { full = false } = {}) {
  return {
    id: idString(r._id),
    scoutId: idString(r.scout),
    scoutName: r.scoutName,
    assignment: r.assignment ? idString(r.assignment) : null,
    subject: subjectView(r.subject),
    recommendation: r.recommendation,
    ratings: r.ratings || {},
    status: r.status,
    observedAt: r.observedAt,
    matchObserved: r.matchObserved,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(full
      ? {
          observations: r.observations,
          strengths: r.strengths,
          weaknesses: r.weaknesses,
          attachments: (r.attachments || []).map((a, i) => ({ index: i, ...privateFileInfo(a), alt: a.alt || '' })),
        }
      : {}),
  };
}

/**
 * PRIVATE scouting workspace. Nothing here is reachable from public endpoints or public search.
 * scope "own": a scout sees only their own reports and assignments.
 */
export function createScoutingRouter({ auth, audit, config, media, notifications }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requireStaff);

  const ownFilter = (req, field) => (scopeOf(req.auth, 'scouting.view') === 'all' ? {} : { [field]: req.auth.user._id });

  const subjectSchema = z
    .object({
      player: objectId.nullable().optional(),
      name: z.string().trim().max(120).optional().default(''),
      currentClub: z.string().trim().max(120).optional().default(''),
      position: z.string().trim().max(60).optional().default(''),
      birthYear: z.number().int().min(1950).max(2100).nullable().optional(),
      location: z.string().trim().max(120).optional().default(''),
    })
    .refine((s) => s.player || s.name, { message: 'Choose a club player or enter the prospect’s name.', path: ['name'] });

  async function checkSubject(subject) {
    if (subject.player && !(await Player.exists({ _id: subject.player }))) throw AppError.validation([{ path: 'subject.player', message: 'Player not found.' }]);
  }

  // ---- Scouts (for the assignment form) ------------------------------------------------------
  router.get('/scouts', auth.requirePermission('scouting.assign'), async (req, res) => {
    const staff = await Staff.find({ status: 'active', user: { $ne: null } }).select('user fullName staffRole grants').lean();
    const scouts = staff.filter((s) => resolveGrants(s).has('scouting.manage'));
    res.json({ data: scouts.map((s) => ({ id: idString(s.user), name: s.fullName, role: s.staffRole })) });
  });

  // ---- Assignments -------------------------------------------------------------------------
  router.get(
    '/assignments',
    auth.requirePermission('scouting.view'),
    validate({ query: z.object({ status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(), ...pagingQuery }) }),
    async (req, res) => {
      const filter = { ...ownFilter(req, 'scout') };
      if (req.valid.query.status) filter.status = req.valid.query.status;
      const result = await findPaged(ScoutingAssignment, filter, getPaging(req.valid.query), (q) =>
        q.sort({ status: 1, dueDate: 1 }).populate('scout', 'name').populate('assignedBy', 'name').populate(PLAYER_POP),
      );
      res.json({ data: { ...result, items: result.items.map(assignmentView) } });
    },
  );

  const assignmentSchema = z.object({
    scout: objectId,
    subject: subjectSchema,
    instructions: z.string().trim().max(3000).optional().default(''),
    dueDate: z.coerce.date().nullable().optional(),
  });

  router.post('/assignments', auth.requirePermission('scouting.assign'), validate({ body: assignmentSchema }), async (req, res) => {
    const body = req.valid.body;
    await checkSubject(body.subject);
    const scoutUser = await User.findOne({ _id: body.scout, status: 'active', role: 'staff' }).lean();
    const scoutStaff = scoutUser ? await Staff.findOne({ user: scoutUser._id, status: 'active' }).lean() : null;
    if (!scoutStaff || !resolveGrants(scoutStaff).has('scouting.manage')) throw AppError.validation([{ path: 'scout', message: 'Choose a staff member who can write scouting reports.' }]);
    const a = await ScoutingAssignment.create({ ...body, assignedBy: req.auth.user._id });
    // Club players being scouted become visible to that scout (players.view on assigned players).
    if (body.subject.player) await Staff.updateOne({ _id: scoutStaff._id }, { $addToSet: { assignedPlayers: body.subject.player } });
    await audit(req, { action: 'scouting.assignment_created', entityType: 'ScoutingAssignment', entityId: a._id, metadata: { scout: body.scout } });
    await notifications.notify(body.scout, { type: 'scouting.assignment', title: 'New scouting assignment', body: body.subject.name || 'A player has been assigned to you.', link: '/dashboard/scouting' });
    res.status(201).json({ data: assignmentView(a.toObject()) });
  });

  router.patch(
    '/assignments/:id',
    auth.requirePermission('scouting.view'),
    validate({ params: idParams, body: z.object({ status: z.enum(['open', 'in_progress', 'completed', 'cancelled']) }) }),
    async (req, res) => {
      const a = await ScoutingAssignment.findOne({ _id: req.valid.params.id, ...ownFilter(req, 'scout') });
      if (!a) throw AppError.notFound('Assignment not found.');
      if (req.valid.body.status === 'cancelled' && !has(req.auth, 'scouting.assign')) throw AppError.forbidden('Only the person who assigns scouting can cancel an assignment.');
      a.status = req.valid.body.status;
      await a.save();
      await audit(req, { action: 'scouting.assignment_status', entityType: 'ScoutingAssignment', entityId: a._id, metadata: { status: a.status } });
      res.json({ data: assignmentView(a.toObject()) });
    },
  );

  router.delete('/assignments/:id', auth.requirePermission('scouting.assign'), validate({ params: idParams }), async (req, res) => {
    const a = await ScoutingAssignment.findByIdAndDelete(req.valid.params.id).lean();
    if (!a) throw AppError.notFound('Assignment not found.');
    await audit(req, { action: 'scouting.assignment_deleted', entityType: 'ScoutingAssignment', entityId: a._id });
    res.json({ data: { id: idString(a._id) } });
  });

  // ---- Reports -----------------------------------------------------------------------------
  router.get(
    '/reports',
    auth.requirePermission('scouting.view'),
    validate({ query: z.object({ q: z.string().max(100).optional(), recommendation: z.enum(['sign', 'monitor', 'trial', 'reject', 'undecided']).optional(), player: objectId.optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { q, recommendation, player } = req.valid.query;
      const filter = { ...ownFilter(req, 'scout') };
      if (q) filter['subject.name'] = containsRegex(q);
      if (recommendation) filter.recommendation = recommendation;
      if (player) filter['subject.player'] = player;
      const result = await findPaged(ScoutingReport, filter, getPaging(req.valid.query), (qq) => qq.sort({ createdAt: -1 }).populate(PLAYER_POP));
      res.json({ data: { ...result, items: result.items.map((r) => reportView(r)) } });
    },
  );

  router.get('/reports/:id', auth.requirePermission('scouting.view'), validate({ params: idParams }), async (req, res) => {
    const r = await ScoutingReport.findOne({ _id: req.valid.params.id, ...ownFilter(req, 'scout') }).populate(PLAYER_POP).lean();
    if (!r) throw AppError.notFound('Report not found.');
    if (idString(r.scout) !== idString(req.auth.user._id)) {
      await audit(req, { action: 'scouting.report_viewed', entityType: 'ScoutingReport', entityId: r._id });
    }
    const canEdit = idString(r.scout) === idString(req.auth.user._id) ? has(req.auth, 'scouting.manage') : scopeOf(req.auth, 'scouting.manage') === 'all';
    res.json({ data: { ...reportView(r, { full: true }), canEdit } });
  });

  router.get('/reports/:id/attachments/:index', auth.requirePermission('scouting.view'), validate({ params: z.object({ id: objectId, index: z.coerce.number().int().min(0).max(50) }) }), async (req, res) => {
    const r = await ScoutingReport.findOne({ _id: req.valid.params.id, ...ownFilter(req, 'scout') }).lean();
    const file = r?.attachments?.[req.valid.params.index];
    if (!file) throw AppError.notFound('Attachment not found.');
    await audit(req, { action: 'scouting.attachment_opened', entityType: 'ScoutingReport', entityId: r._id });
    res.json({ data: { url: media.privateUrl(file), expiresInSeconds: 300 } });
  });

  const rating = z.number().int().min(1).max(10).nullable().optional();
  const reportSchema = z.object({
    assignment: objectId.nullable().optional(),
    subject: subjectSchema,
    matchObserved: z.string().trim().max(200).optional().default(''),
    observedAt: z.coerce.date().nullable().optional(),
    observations: z.string().trim().min(10, 'Write your observations.').max(20000),
    strengths: z.string().trim().max(3000).optional().default(''),
    weaknesses: z.string().trim().max(3000).optional().default(''),
    ratings: z.object({ technical: rating, tactical: rating, physical: rating, mental: rating, potential: rating }).prefault({}),
    recommendation: z.enum(['sign', 'monitor', 'trial', 'reject', 'undecided']).optional().default('undecided'),
    attachments: z.array(mediaInput(config)).max(10).optional().default([]),
    status: z.enum(['draft', 'submitted']).optional().default('submitted'),
  });

  router.post('/reports', auth.requirePermission('scouting.manage'), validate({ body: reportSchema }), async (req, res) => {
    const body = req.valid.body;
    await checkSubject(body.subject);
    if (body.assignment && !(await ScoutingAssignment.exists({ _id: body.assignment, scout: req.auth.user._id }))) {
      throw AppError.validation([{ path: 'assignment', message: 'Assignment not found.' }]);
    }
    const r = await ScoutingReport.create({
      ...body,
      attachments: body.attachments.filter(Boolean),
      scout: req.auth.user._id,
      scoutName: req.auth.staff.fullName || req.auth.user.name,
    });
    if (body.assignment && body.status === 'submitted') await ScoutingAssignment.updateOne({ _id: body.assignment }, { $set: { status: 'completed' } });
    await audit(req, { action: 'scouting.report_created', entityType: 'ScoutingReport', entityId: r._id, metadata: { recommendation: r.recommendation } });
    if (body.status === 'submitted') {
      await notifications.notifyPermission('scouting.assign', { type: 'scouting.report', title: 'New scouting report', body: `${r.scoutName}: ${r.subject.name || 'club player'}`, link: `/dashboard/scouting/reports/${r._id}` });
    }
    res.status(201).json({ data: reportView(r.toObject(), { full: true }) });
  });

  router.put('/reports/:id', auth.requirePermission('scouting.manage'), validate({ params: idParams, body: reportSchema }), async (req, res) => {
    const filter = scopeOf(req.auth, 'scouting.manage') === 'all' ? { _id: req.valid.params.id } : { _id: req.valid.params.id, scout: req.auth.user._id };
    const r = await ScoutingReport.findOne(filter);
    if (!r) throw AppError.notFound('Report not found.');
    await checkSubject(req.valid.body.subject);
    // Attachments sent on update are ADDED; existing private files are kept.
    r.set({ ...req.valid.body, attachments: [...r.attachments, ...req.valid.body.attachments.filter(Boolean)] });
    await r.save();
    await audit(req, { action: 'scouting.report_updated', entityType: 'ScoutingReport', entityId: r._id });
    res.json({ data: reportView(r.toObject(), { full: true }) });
  });

  router.delete('/reports/:id', auth.requirePermission('scouting.manage'), validate({ params: idParams }), async (req, res) => {
    const filter = scopeOf(req.auth, 'scouting.manage') === 'all' ? { _id: req.valid.params.id } : { _id: req.valid.params.id, scout: req.auth.user._id };
    const r = await ScoutingReport.findOneAndDelete(filter).lean();
    if (!r) throw AppError.notFound('Report not found.');
    for (const file of r.attachments || []) await media.destroy(file);
    await audit(req, { action: 'scouting.report_deleted', entityType: 'ScoutingReport', entityId: r._id });
    res.json({ data: { id: idString(r._id) } });
  });

  return router;
}
