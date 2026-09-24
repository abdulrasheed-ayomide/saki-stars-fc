import { Router } from 'express';
import { z } from 'zod';
import { Competition, Season, Team, Match, News, StandingsAdjustment } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, mediaInput } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { uniqueSlug } from '../../utils/text.js';
import { idOrSlugFilter, idString } from '../../utils/ids.js';
import { publicCompetition, competitionSummary, matchSummary, newsSummary } from '../../serializers/index.js';
import { calculateStandings } from '../../services/standings.service.js';
import { MATCH_POPULATE } from './teams.routes.js';
import { currentSeason } from './seasons.routes.js';

const POPULATE = [
  { path: 'seasons', select: 'name startDate endDate isCurrent status' },
  { path: 'currentSeason', select: 'name startDate endDate isCurrent status' },
  { path: 'teams', select: 'name shortName slug logo isClubTeam' },
];

async function resolveSeason(competition, seasonId) {
  if (seasonId) return seasonId;
  if (competition.currentSeason) return idString(competition.currentSeason._id ?? competition.currentSeason);
  const cur = await currentSeason();
  return cur ? idString(cur._id) : null;
}

export function createCompetitionRouters({ auth, audit, config, media }) {
  const pub = Router();
  const admin = Router();

  const competitionSchema = z.object({
    name: z.string().trim().min(2, 'Enter the competition name.').max(120),
    shortName: z.string().trim().max(30).optional().default(''),
    logo: mediaInput(config),
    description: z.string().trim().max(4000).optional().default(''),
    organizer: z.string().trim().max(150).optional().default(''),
    type: z.enum(['league', 'cup', 'friendly']).optional().default('league'),
    rules: z
      .object({
        pointsWin: z.number().int().min(0).max(10).optional().default(3),
        pointsDraw: z.number().int().min(0).max(10).optional().default(1),
        pointsLoss: z.number().int().min(0).max(10).optional().default(0),
        tieBreakers: z
          .array(z.enum(['points', 'goal_difference', 'goals_for', 'head_to_head', 'wins', 'name']))
          .max(6)
          .optional()
          .default(['points', 'goal_difference', 'goals_for', 'head_to_head', 'name']),
        countsForStandings: z.boolean().optional().default(true),
      })
      
      .prefault({}),
    seasons: z.array(objectId).max(50).optional().default([]),
    currentSeason: objectId.nullable().optional(),
    teams: z.array(objectId).max(100).optional().default([]),
    status: z.enum(['active', 'inactive', 'archived']).optional().default('active'),
    displayOrder: z.number().int().min(0).max(1000).optional().default(100),
  });

  // ---- Public -------------------------------------------------------------------------
  pub.get('/', async (req, res) => {
    const list = await Competition.find({ status: 'active' }).sort({ displayOrder: 1, name: 1 }).populate(POPULATE).lean();
    res.json({ data: list.map(publicCompetition) });
  });

  async function loadPublic(idOrSlug) {
    const c = await Competition.findOne({ ...idOrSlugFilter(idOrSlug), status: { $ne: 'archived' } }).populate(POPULATE).lean();
    if (!c) throw AppError.notFound('Competition not found.');
    return c;
  }

  pub.get('/:id', async (req, res) => {
    res.json({ data: publicCompetition(await loadPublic(req.params.id)) });
  });

  pub.get('/:id/standings', validate({ query: z.object({ season: objectId.optional() }) }), async (req, res) => {
    const c = await loadPublic(req.params.id);
    const seasonId = await resolveSeason(c, req.valid.query.season);
    if (!seasonId) return res.json({ data: { applicable: false, rows: [], season: null } });
    const season = await Season.findById(seasonId).lean();
    const table = await calculateStandings(c, seasonId);
    res.json({ data: { ...table, season: season ? { id: idString(season._id), name: season.name } : null } });
  });

  pub.get(
    '/:id/matches',
    validate({ query: z.object({ season: objectId.optional(), type: z.enum(['fixtures', 'results', 'all']).optional().default('all') }) }),
    async (req, res) => {
      const c = await loadPublic(req.params.id);
      const seasonId = await resolveSeason(c, req.valid.query.season);
      const filter = { competition: c._id, deletedAt: null };
      if (seasonId) filter.season = seasonId;
      const { type } = req.valid.query;
      if (type === 'fixtures') filter.status = { $in: ['scheduled', 'postponed', 'live'] };
      if (type === 'results') filter.status = { $in: ['completed', 'abandoned'] };
      const matches = await Match.find(filter)
        .sort({ kickoffAt: type === 'results' ? -1 : 1 })
        .limit(200)
        .populate(MATCH_POPULATE)
        .lean();
      res.json({ data: matches.map(matchSummary) });
    },
  );

  pub.get('/:id/news', async (req, res) => {
    const c = await loadPublic(req.params.id);
    const news = await News.find({ competition: c._id, status: 'published', deletedAt: null })
      .sort({ publishedAt: -1 })
      .limit(12)
      .populate('author', 'name')
      .populate('competition', 'name shortName slug logo type')
      .populate('team', 'name shortName slug logo isClubTeam')
      .lean();
    res.json({ data: news.map(newsSummary) });
  });

  // ---- Admin --------------------------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff);

  admin.get('/', async (req, res) => {
    const list = await Competition.find().sort({ status: 1, displayOrder: 1, name: 1 }).populate(POPULATE).lean();
    res.json({ data: list.map(publicCompetition) });
  });

  admin.get('/:id', validate({ params: idParams }), async (req, res) => {
    const c = await Competition.findById(req.valid.params.id).populate(POPULATE).lean();
    if (!c) throw AppError.notFound('Competition not found.');
    res.json({ data: publicCompetition(c) });
  });

  async function checkRefs(body) {
    const seasons = [...new Set([...(body.seasons || []), ...(body.currentSeason ? [body.currentSeason] : [])])];
    if (seasons.length && (await Season.countDocuments({ _id: { $in: seasons } })) !== seasons.length) {
      throw AppError.validation([{ path: 'seasons', message: 'One of the seasons no longer exists.' }]);
    }
    if (body.teams.length && (await Team.countDocuments({ _id: { $in: body.teams } })) !== body.teams.length) {
      throw AppError.validation([{ path: 'teams', message: 'One of the teams no longer exists.' }]);
    }
    return { ...body, seasons };
  }

  admin.post('/', auth.requirePermission('competitions.manage'), validate({ body: competitionSchema }), async (req, res) => {
    const body = await checkRefs(req.valid.body);
    const c = await Competition.create({ ...body, slug: await uniqueSlug(Competition, body.name) });
    await Team.updateMany({ _id: { $in: body.teams } }, { $addToSet: { competitions: c._id } });
    await audit(req, { action: 'competition.created', entityType: 'Competition', entityId: c._id, metadata: { name: c.name } });
    res.status(201).json({ data: competitionSummary(c.toObject()) });
  });

  admin.put('/:id', auth.requirePermission('competitions.manage'), validate({ params: idParams, body: competitionSchema }), async (req, res) => {
    const body = await checkRefs(req.valid.body);
    const existing = await Competition.findById(req.valid.params.id).lean();
    if (!existing) throw AppError.notFound('Competition not found.');
    const update = { ...body };
    if (body.name !== existing.name) update.slug = await uniqueSlug(Competition, body.name, { excludeId: existing._id });
    const c = await Competition.findByIdAndUpdate(existing._id, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
    await Team.updateMany({ _id: { $in: body.teams } }, { $addToSet: { competitions: c._id } });
    await Team.updateMany({ _id: { $nin: body.teams }, competitions: c._id }, { $pull: { competitions: c._id } });
    if (existing.logo?.publicId && existing.logo.publicId !== body.logo?.publicId) await media.destroy(existing.logo);
    const rulesChanged = JSON.stringify(existing.rules) !== JSON.stringify(c.rules);
    await audit(req, { action: 'competition.updated', entityType: 'Competition', entityId: c._id, metadata: { name: c.name, rulesChanged, rules: c.rules } });
    res.json({ data: competitionSummary(c) });
  });

  admin.delete('/:id', auth.requirePermission('competitions.manage'), validate({ params: idParams }), async (req, res) => {
    const id = req.valid.params.id;
    if (await Match.exists({ competition: id })) {
      throw AppError.conflict('This competition has matches, so it cannot be deleted. Set its status to Archived instead.');
    }
    const c = await Competition.findByIdAndDelete(id).lean();
    if (!c) throw AppError.notFound('Competition not found.');
    await Team.updateMany({ competitions: id }, { $pull: { competitions: id } });
    await StandingsAdjustment.deleteMany({ competition: id });
    await media.destroy(c.logo);
    await audit(req, { action: 'competition.deleted', entityType: 'Competition', entityId: id, metadata: { name: c.name } });
    res.json({ data: { id } });
  });

  // ---- Standings corrections (explicit, audited, reversible) -----------------------------
  const adjustmentSchema = z
    .object({
      season: objectId,
      team: objectId,
      points: z.number().int().min(-100).max(100).optional().default(0),
      goalsFor: z.number().int().min(-100).max(100).optional().default(0),
      goalsAgainst: z.number().int().min(-100).max(100).optional().default(0),
      reason: z.string().trim().min(10, 'Explain the reason for this correction (at least 10 characters).').max(500),
    })
    .refine((a) => a.points || a.goalsFor || a.goalsAgainst, { message: 'Enter at least one non-zero correction.', path: ['points'] });

  admin.get('/:id/adjustments', auth.requirePermission('standings.override', 'competitions.manage'), validate({ params: idParams }), async (req, res) => {
    const list = await StandingsAdjustment.find({ competition: req.valid.params.id })
      .sort({ createdAt: -1 })
      .populate('team', 'name shortName slug logo isClubTeam')
      .populate('season', 'name')
      .populate('createdBy', 'name')
      .populate('revokedBy', 'name')
      .lean();
    res.json({
      data: list.map((a) => ({
        id: idString(a._id),
        team: a.team ? { id: idString(a.team._id), name: a.team.name } : null,
        season: a.season ? { id: idString(a.season._id), name: a.season.name } : null,
        points: a.points,
        goalsFor: a.goalsFor,
        goalsAgainst: a.goalsAgainst,
        reason: a.reason,
        createdBy: a.createdBy?.name || '',
        createdAt: a.createdAt,
        revokedAt: a.revokedAt,
        revokedBy: a.revokedBy?.name || '',
      })),
    });
  });

  admin.post('/:id/adjustments', auth.requirePermission('standings.override'), validate({ params: idParams, body: adjustmentSchema }), async (req, res) => {
    const c = await Competition.findById(req.valid.params.id).lean();
    if (!c) throw AppError.notFound('Competition not found.');
    const body = req.valid.body;
    if (!(await Season.exists({ _id: body.season }))) throw AppError.validation([{ path: 'season', message: 'Season not found.' }]);
    if (!(await Team.exists({ _id: body.team }))) throw AppError.validation([{ path: 'team', message: 'Team not found.' }]);
    const adj = await StandingsAdjustment.create({ ...body, competition: c._id, createdBy: req.auth.user._id });
    await audit(req, { action: 'standings.adjusted', entityType: 'Competition', entityId: c._id, metadata: { adjustmentId: adj._id, ...body } });
    res.status(201).json({ data: { id: idString(adj._id) } });
  });

  admin.delete('/:id/adjustments/:adjId', auth.requirePermission('standings.override'), validate({ params: z.object({ id: objectId, adjId: objectId }) }), async (req, res) => {
    const adj = await StandingsAdjustment.findOneAndUpdate(
      { _id: req.valid.params.adjId, competition: req.valid.params.id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedBy: req.auth.user._id } },
      { returnDocument: 'after' },
    ).lean();
    if (!adj) throw AppError.notFound('Correction not found or already revoked.');
    await audit(req, { action: 'standings.adjustment_revoked', entityType: 'Competition', entityId: req.valid.params.id, metadata: { adjustmentId: adj._id, reason: adj.reason } });
    res.json({ data: { id: idString(adj._id) } });
  });

  return { pub, admin };
}
