import { Router } from 'express';
import { z } from 'zod';
import { Report, Team, Player, Match } from '../../models/index.js';
import { REPORT_TYPES, REPORT_STATUSES } from '../../models/Operations.js';
import { STAFF_ROLES } from '../../auth/permissions.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { containsRegex } from '../../utils/text.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { scopeOf, has } from '../../auth/access.js';
import { playerLink, teamSummary, matchSummary } from '../../serializers/index.js';
import { MATCH_POPULATE } from '../football/teams.routes.js';

const POP = [
  { path: 'team', select: 'name shortName slug logo isClubTeam' },
  { path: 'player', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly' },
  { path: 'match', populate: MATCH_POPULATE },
  { path: 'reviewer', select: 'name' },
];

function view(r, { full = false } = {}) {
  return {
    id: idString(r._id),
    title: r.title,
    type: r.type,
    status: r.status,
    authorName: r.authorName,
    authorRole: r.authorRole,
    authorRoleLabel: STAFF_ROLES[r.authorRole]?.label || r.authorRole,
    authorId: idString(r.author),
    team: r.team && r.team._id ? teamSummary(r.team) : null,
    player: r.player && r.player._id ? playerLink(r.player) : null,
    match: r.match && r.match._id ? matchSummary(r.match) : null,
    reviewer: r.reviewer?.name || '',
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
    ...(full ? { content: r.content, reviewNote: r.reviewNote } : {}),
  };
}

/**
 * Staff reports are operational records. There is deliberately no ranking or
 * "top reporter" view: report counts say nothing about the quality of someone's work.
 */
export function createReportsRouter({ auth, audit, notifications }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requireStaff);

  function visibilityFilter(req) {
    const scope = scopeOf(req.auth, 'reports.view');
    if (scope === 'all') return {};
    if (scope === 'assigned_teams') return { $or: [{ author: req.auth.user._id }, { team: { $in: [...req.auth.assignedTeams] } }] };
    return { author: req.auth.user._id };
  }

  router.get(
    '/',
    auth.requirePermission('reports.view', 'reports.create'),
    validate({ query: z.object({ status: z.enum(REPORT_STATUSES).optional(), type: z.enum(REPORT_TYPES).optional(), team: objectId.optional(), q: z.string().max(100).optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { status, type, team, q } = req.valid.query;
      const filter = { ...visibilityFilter(req) };
      if (status) filter.status = status;
      if (type) filter.type = type;
      if (team) filter.team = team;
      if (q) filter.title = containsRegex(q);
      const result = await findPaged(Report, filter, getPaging(req.valid.query), (qq) => qq.sort({ createdAt: -1 }).populate(POP));
      res.json({ data: { ...result, items: result.items.map((r) => view(r)), types: REPORT_TYPES } });
    },
  );

  router.get('/:id', auth.requirePermission('reports.view', 'reports.create'), validate({ params: idParams }), async (req, res) => {
    const r = await Report.findOne({ _id: req.valid.params.id, ...visibilityFilter(req) }).populate(POP).lean();
    if (!r) throw AppError.notFound('Report not found.');
    res.json({ data: { ...view(r, { full: true }), canReview: has(req.auth, 'reports.review') && idString(r.author) !== idString(req.auth.user._id) } });
  });

  const createSchema = z.object({
    type: z.enum(REPORT_TYPES).optional().default('general'),
    title: z.string().trim().min(3).max(200),
    content: z.string().trim().min(10, 'Write the report (at least 10 characters).').max(20000),
    team: objectId.nullable().optional(),
    player: objectId.nullable().optional(),
    match: objectId.nullable().optional(),
  });

  router.post('/', auth.requirePermission('reports.create'), validate({ body: createSchema }), async (req, res) => {
    const body = req.valid.body;
    const problems = [];
    if (body.team && !(await Team.exists({ _id: body.team }))) problems.push({ path: 'team', message: 'Team not found.' });
    if (body.player && !(await Player.exists({ _id: body.player }))) problems.push({ path: 'player', message: 'Player not found.' });
    if (body.match && !(await Match.exists({ _id: body.match }))) problems.push({ path: 'match', message: 'Match not found.' });
    if (problems.length) throw AppError.validation(problems);
    const r = await Report.create({
      ...body,
      author: req.auth.user._id,
      authorName: req.auth.staff.fullName || req.auth.user.name,
      authorRole: req.auth.staff.staffRole,
    });
    await audit(req, { action: 'report.submitted', entityType: 'Report', entityId: r._id, metadata: { type: r.type } });
    await notifications.notifyPermission('reports.review', { type: 'report.submitted', title: 'New staff report', body: `${r.authorName}: ${r.title}`, link: `/dashboard/reports/${r._id}` });
    res.status(201).json({ data: view(r.toObject()) });
  });

  router.post(
    '/:id/review',
    auth.requirePermission('reports.review'),
    validate({ params: idParams, body: z.object({ status: z.enum(['under_review', 'reviewed', 'archived']), reviewNote: z.string().trim().max(3000).optional().default('') }) }),
    async (req, res) => {
      const r = await Report.findById(req.valid.params.id);
      if (!r) throw AppError.notFound('Report not found.');
      if (idString(r.author) === idString(req.auth.user._id)) throw AppError.forbidden('You cannot review your own report.');
      r.status = req.valid.body.status;
      r.reviewNote = req.valid.body.reviewNote;
      r.reviewer = req.auth.user._id;
      r.reviewedAt = new Date();
      await r.save();
      await audit(req, { action: 'report.reviewed', entityType: 'Report', entityId: r._id, metadata: { status: r.status } });
      await notifications.notify(r.author, { type: 'report.reviewed', title: 'Your report was reviewed', body: r.title, link: `/dashboard/reports/${r._id}` });
      res.json({ data: view((await r.populate(POP)).toObject(), { full: true }) });
    },
  );

  return router;
}
