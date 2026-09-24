import { Router } from 'express';
import { z } from 'zod';
import { Team, Player, Match, Competition, Staff } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, mediaInput, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { uniqueSlug, containsRegex } from '../../utils/text.js';
import { idOrSlugFilter, idString } from '../../utils/ids.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { publicTeam, publicPlayer, matchSummary, publicStaff, teamSummary } from '../../serializers/index.js';
import { playerStats, teamRecord } from '../../services/stats.service.js';
import { currentSeason } from './seasons.routes.js';

const MATCH_POPULATE = [
  { path: 'homeTeam', select: 'name shortName slug logo isClubTeam' },
  { path: 'awayTeam', select: 'name shortName slug logo isClubTeam' },
  { path: 'competition', select: 'name shortName slug logo type' },
  { path: 'season', select: 'name startDate endDate isCurrent status' },
];
export { MATCH_POPULATE };

export function createTeamRouters({ auth, audit, config, media }) {
  const pub = Router();
  const admin = Router();

  const teamSchema = z.object({
    name: z.string().trim().min(2, 'Enter the team name.').max(100),
    shortName: z.string().trim().max(30).optional().default(''),
    isClubTeam: z.boolean().optional().default(false),
    logo: mediaInput(config),
    description: z.string().trim().max(4000).optional().default(''),
    category: z.string().trim().max(60).optional().default(''),
    ageGroup: z.string().trim().max(30).optional().default(''),
    homeVenue: z.string().trim().max(150).optional().default(''),
    competitions: z.array(objectId).max(30).optional().default([]),
    season: objectId.nullable().optional(),
    status: z.enum(['active', 'inactive', 'archived']).optional().default('active'),
    displayOrder: z.number().int().min(0).max(1000).optional().default(100),
    containsMinors: z.boolean().optional().default(false),
  });

  // ---- Public -----------------------------------------------------------------------
  pub.get('/', validate({ query: z.object({ include: z.enum(['club', 'all']).optional(), competition: objectId.optional() }) }), async (req, res) => {
    const { include, competition } = req.valid.query;
    const filter = { status: 'active' };
    if (include !== 'all') filter.isClubTeam = true;
    if (competition) filter.competitions = competition;
    const teams = await Team.find(filter).sort({ displayOrder: 1, name: 1 }).populate('competitions', 'name shortName slug logo type').lean();
    res.json({ data: teams.map(publicTeam) });
  });

  pub.get('/:id', async (req, res) => {
    const team = await Team.findOne({ ...idOrSlugFilter(req.params.id), status: { $ne: 'archived' } })
      .populate('competitions', 'name shortName slug logo type')
      .populate('season', 'name startDate endDate isCurrent status')
      .lean();
    if (!team) throw AppError.notFound('Team not found.');

    const season = team.season || (await currentSeason());
    const now = new Date();
    const involving = { deletedAt: null, $or: [{ homeTeam: team._id }, { awayTeam: team._id }] };

    const [squad, fixtures, results, record, staff] = await Promise.all([
      team.isClubTeam
        ? Player.find({ team: team._id, showOnWebsite: true, deletedAt: null, status: { $in: ['active', 'injured', 'on_loan'] } })
            .populate('team', 'name shortName slug logo isClubTeam')
            .sort({ jerseyNumber: 1, lastName: 1 })
            .lean()
        : [],
      Match.find({ ...involving, status: { $in: ['scheduled', 'postponed', 'live'] }, kickoffAt: { $gte: new Date(now.getTime() - 3 * 3600 * 1000) } })
        .sort({ kickoffAt: 1 })
        .limit(10)
        .populate(MATCH_POPULATE)
        .lean(),
      Match.find({ ...involving, status: 'completed' }).sort({ kickoffAt: -1 }).limit(10).populate(MATCH_POPULATE).lean(),
      teamRecord(team._id, { season: season?._id }),
      team.isClubTeam ? Staff.find({ team: team._id, showOnWebsite: true, status: 'active' }).sort({ displayOrder: 1 }).lean() : [],
    ]);

    const stats = await playerStats(squad.map((p) => p._id), { season: season?._id });
    res.json({
      data: {
        ...publicTeam(team),
        squad: squad.map((p) => publicPlayer(p, { stats: stats.get(idString(p._id)) })),
        staff: staff.map(publicStaff),
        fixtures: fixtures.map(matchSummary),
        results: results.map(matchSummary),
        record: { season: season ? { id: idString(season._id), name: season.name } : null, ...record },
      },
    });
  });

  // ---- Admin ------------------------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff);

  // Any staff member can list teams (needed for forms); editing needs teams.manage.
  admin.get(
    '/',
    validate({ query: z.object({ q: z.string().max(100).optional(), isClubTeam: z.enum(['true', 'false']).optional(), status: z.string().max(20).optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { q, isClubTeam, status } = req.valid.query;
      const filter = {};
      if (q) filter.name = containsRegex(q);
      if (isClubTeam) filter.isClubTeam = isClubTeam === 'true';
      if (status) filter.status = status;
      const paging = getPaging(req.valid.query, { defaultLimit: 50, maxLimit: 200 });
      const result = await findPaged(Team, filter, paging, (qq) => qq.sort({ isClubTeam: -1, displayOrder: 1, name: 1 }).populate('competitions', 'name shortName slug logo type'));
      const counts = await Promise.all(result.items.map((t) => Player.countDocuments({ team: t._id, deletedAt: null })));
      res.json({ data: { ...result, items: result.items.map((t, i) => ({ ...publicTeam(t), containsMinors: Boolean(t.containsMinors), playerCount: counts[i] })) } });
    },
  );

  admin.get('/:id', validate({ params: idParams }), async (req, res) => {
    const team = await Team.findById(req.valid.params.id).populate('competitions', 'name shortName slug logo type').populate('season', 'name startDate endDate isCurrent status').lean();
    if (!team) throw AppError.notFound('Team not found.');
    res.json({ data: { ...publicTeam(team), containsMinors: Boolean(team.containsMinors) } });
  });

  async function syncCompetitions(teamId, competitionIds) {
    await Competition.updateMany({ _id: { $in: competitionIds } }, { $addToSet: { teams: teamId } });
    await Competition.updateMany({ _id: { $nin: competitionIds }, teams: teamId }, { $pull: { teams: teamId } });
  }

  admin.post('/', auth.requirePermission('teams.manage'), validate({ body: teamSchema }), async (req, res) => {
    const body = req.valid.body;
    const team = await Team.create({ ...body, slug: await uniqueSlug(Team, body.name) });
    await syncCompetitions(team._id, body.competitions);
    await audit(req, { action: 'team.created', entityType: 'Team', entityId: team._id, metadata: { name: team.name, isClubTeam: team.isClubTeam } });
    res.status(201).json({ data: teamSummary(team.toObject()) });
  });

  admin.put('/:id', auth.requirePermission('teams.manage'), validate({ params: idParams, body: teamSchema }), async (req, res) => {
    const body = req.valid.body;
    const existing = await Team.findById(req.valid.params.id).lean();
    if (!existing) throw AppError.notFound('Team not found.');
    const update = { ...body };
    if (body.name !== existing.name) update.slug = await uniqueSlug(Team, body.name, { excludeId: existing._id });
    const team = await Team.findByIdAndUpdate(existing._id, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
    await syncCompetitions(team._id, body.competitions);
    if (existing.logo?.publicId && existing.logo.publicId !== body.logo?.publicId) await media.destroy(existing.logo);
    await audit(req, { action: 'team.updated', entityType: 'Team', entityId: team._id, metadata: { name: team.name, status: team.status } });
    res.json({ data: teamSummary(team) });
  });

  admin.delete('/:id', auth.requirePermission('teams.manage'), validate({ params: idParams }), async (req, res) => {
    const id = req.valid.params.id;
    const [matches, players] = await Promise.all([
      Match.exists({ $or: [{ homeTeam: id }, { awayTeam: id }] }),
      Player.exists({ team: id }),
    ]);
    if (matches || players) {
      throw AppError.conflict('This team has matches or players, so it cannot be deleted. Set its status to Archived to keep the history.');
    }
    const team = await Team.findByIdAndDelete(id).lean();
    if (!team) throw AppError.notFound('Team not found.');
    await Competition.updateMany({ teams: id }, { $pull: { teams: id } });
    await media.destroy(team.logo);
    await audit(req, { action: 'team.deleted', entityType: 'Team', entityId: id, metadata: { name: team.name } });
    res.json({ data: { id } });
  });

  return { pub, admin };
}
