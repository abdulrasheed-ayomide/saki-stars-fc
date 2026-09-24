import { Router } from 'express';
import { z } from 'zod';
import { Match, Team, Competition, Season, Player, Staff, Video } from '../../models/index.js';
import { MATCH_STATUSES, EVENT_TYPES } from '../../models/Football.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { matchSummary, publicMatch } from '../../serializers/index.js';
import { canAccessMatch, assertAccess, matchScopeFilter, has } from '../../auth/access.js';
import { withTransaction } from '../../db/connection.js';
import { MATCH_POPULATE } from './teams.routes.js';

const DETAIL_POPULATE = [
  ...MATCH_POPULATE,
  { path: 'events.player', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly' },
  { path: 'events.assist', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly' },
  { path: 'events.playerOff', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly' },
  { path: 'lineups.home.player', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly' },
  { path: 'lineups.away.player', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly' },
  { path: 'highlightsVideo' },
];

async function clubTeamIds() {
  return (await Team.find({ isClubTeam: true }).select('_id').lean()).map((t) => t._id);
}

/** Users (players and staff) attached to the given club teams, for match notifications. */
async function teamMemberUserIds(teamIds) {
  const ids = teamIds.map(idString);
  const [players, staff] = await Promise.all([
    Player.find({ team: { $in: ids }, user: { $ne: null }, deletedAt: null }).select('user').lean(),
    Staff.find({ status: 'active', user: { $ne: null }, $or: [{ team: { $in: ids } }, { assignedTeams: { $in: ids } }] }).select('user').lean(),
  ]);
  return [...players, ...staff].map((d) => d.user).filter(Boolean);
}

function describeMatch(m) {
  return `${m.homeTeam?.name ?? 'Home'} v ${m.awayTeam?.name ?? 'Away'}`;
}

export function createMatchRouters({ auth, audit, notifications }) {
  const pub = Router();
  const admin = Router();

  // ---- Public -------------------------------------------------------------------------
  const listQuery = z.object({
    competition: objectId.optional(),
    team: objectId.optional(),
    season: objectId.optional(),
    venue: z.enum(['home', 'away']).optional(),
    status: z.enum(['upcoming', 'completed', 'all']).optional().default('all'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    ...pagingQuery,
  });

  pub.get('/', validate({ query: listQuery }), async (req, res) => {
    const q = req.valid.query;
    const filter = { deletedAt: null };
    if (q.competition) filter.competition = q.competition;
    if (q.season) filter.season = q.season;
    if (q.status === 'upcoming') filter.status = { $in: ['scheduled', 'postponed', 'live'] };
    if (q.status === 'completed') filter.status = { $in: ['completed', 'abandoned'] };
    if (q.from || q.to) filter.kickoffAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };

    // Home/away is from the club's point of view (or the chosen team's).
    const side = q.team ? [q.team] : q.venue ? await clubTeamIds() : null;
    if (q.venue === 'home') filter.homeTeam = { $in: side };
    else if (q.venue === 'away') filter.awayTeam = { $in: side };
    else if (q.team) filter.$or = [{ homeTeam: q.team }, { awayTeam: q.team }];

    const paging = getPaging(q, { defaultLimit: 30, maxLimit: 100 });
    const result = await findPaged(Match, filter, paging, (qq) =>
      qq.sort({ kickoffAt: q.status === 'completed' ? -1 : 1 }).populate(MATCH_POPULATE),
    );
    res.json({ data: { ...result, items: result.items.map(matchSummary) } });
  });

  pub.get('/next', validate({ query: z.object({ team: objectId.optional() }) }), async (req, res) => {
    const teams = req.valid.query.team ? [req.valid.query.team] : await clubTeamIds();
    const match = await Match.findOne({
      deletedAt: null,
      status: { $in: ['scheduled', 'live'] },
      kickoffAt: { $gte: new Date(Date.now() - 2 * 3600 * 1000) },
      $or: [{ homeTeam: { $in: teams } }, { awayTeam: { $in: teams } }],
    })
      .sort({ kickoffAt: 1 })
      .populate(MATCH_POPULATE)
      .lean();
    res.json({ data: match ? matchSummary(match) : null });
  });

  pub.get('/latest-result', validate({ query: z.object({ team: objectId.optional() }) }), async (req, res) => {
    const teams = req.valid.query.team ? [req.valid.query.team] : await clubTeamIds();
    const match = await Match.findOne({
      deletedAt: null,
      status: 'completed',
      $or: [{ homeTeam: { $in: teams } }, { awayTeam: { $in: teams } }],
    })
      .sort({ kickoffAt: -1 })
      .populate(DETAIL_POPULATE)
      .lean();
    res.json({ data: match ? publicMatch(match) : null });
  });

  pub.get('/:id', validate({ params: idParams }), async (req, res) => {
    const match = await Match.findOne({ _id: req.valid.params.id, deletedAt: null }).populate(DETAIL_POPULATE).lean();
    if (!match) throw AppError.notFound('Match not found.');
    res.json({ data: publicMatch(match) });
  });

  // ---- Admin --------------------------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff);

  const detailsSchema = z
    .object({
      competition: objectId,
      season: objectId,
      homeTeam: objectId,
      awayTeam: objectId,
      kickoffAt: z.coerce.date({ error: 'Enter the kick-off date and time.' }),
      venue: z.string().trim().max(150).optional().default(''),
      referee: z.string().trim().max(120).optional().default(''),
      round: z.string().trim().max(60).optional().default(''),
      status: z.enum(['scheduled', 'postponed', 'cancelled', 'live']).optional().default('scheduled'),
      statusNote: z.string().trim().max(300).optional().default(''),
    })
    .refine((m) => m.homeTeam !== m.awayTeam, { path: ['awayTeam'], message: 'A team cannot play itself.' });

  const eventSchema = z.object({
    type: z.enum(EVENT_TYPES),
    minute: z.number().int().min(0).max(150),
    addedTime: z.number().int().min(0).max(30).optional().default(0),
    side: z.enum(['home', 'away']),
    player: objectId.nullable().optional(),
    playerName: z.string().trim().max(120).optional().default(''),
    assist: objectId.nullable().optional(),
    assistName: z.string().trim().max(120).optional().default(''),
    playerOff: objectId.nullable().optional(),
    playerOffName: z.string().trim().max(120).optional().default(''),
    note: z.string().trim().max(200).optional().default(''),
  });
  const lineupEntry = z.object({
    player: objectId,
    starter: z.boolean().optional().default(true),
    minutes: z.number().int().min(0).max(150).nullable().optional(),
    shirtNumber: z.number().int().min(1).max(99).nullable().optional(),
  });
  const pair = z.object({ home: z.number().int().min(0).max(999).nullable().optional(), away: z.number().int().min(0).max(999).nullable().optional() }).optional();
  const resultSchema = z.object({
    status: z.enum(['completed', 'abandoned', 'live']).optional().default('completed'),
    score: z.object({
      home: z.number().int().min(0).max(99),
      away: z.number().int().min(0).max(99),
      homePenalties: z.number().int().min(0).max(99).nullable().optional(),
      awayPenalties: z.number().int().min(0).max(99).nullable().optional(),
    }),
    events: z.array(eventSchema).max(200).optional().default([]),
    lineups: z.object({ home: z.array(lineupEntry).max(40).optional().default([]), away: z.array(lineupEntry).max(40).optional().default([]) }).prefault({}),
    stats: z
      .object({ possession: pair, shots: pair, shotsOnTarget: pair, corners: pair, fouls: pair, offsides: pair })
      
      .prefault({}),
  });
  const reportSchema = z.object({
    title: z.string().trim().max(200).optional().default(''),
    body: z.string().trim().max(20000),
    publish: z.boolean().optional().default(false),
  });
  const standingsSchema = z.object({
    countsForStandings: z.boolean(),
    resultStands: z.boolean().optional().default(false),
    reason: z.string().trim().min(10, 'Explain the decision (at least 10 characters).').max(500),
  });

  async function loadForEdit(req, permission = 'matches.manage') {
    const match = await Match.findOne({ _id: req.valid.params.id, deletedAt: null }).populate(MATCH_POPULATE);
    if (!match) throw AppError.notFound('Match not found.');
    assertAccess(canAccessMatch(req.auth, permission, match.toObject({ depopulate: true })), 'This match does not involve a team assigned to you.');
    return match;
  }

  async function checkDetailRefs(body) {
    const [competition, season, teams] = await Promise.all([
      Competition.findById(body.competition).lean(),
      Season.exists({ _id: body.season }),
      Team.find({ _id: { $in: [body.homeTeam, body.awayTeam] } }).lean(),
    ]);
    const problems = [];
    if (!competition) problems.push({ path: 'competition', message: 'Competition not found.' });
    if (!season) problems.push({ path: 'season', message: 'Season not found.' });
    if (teams.length !== 2) problems.push({ path: 'homeTeam', message: 'Both teams must exist.' });
    if (teams.length === 2 && !teams.some((t) => t.isClubTeam)) {
      // Allowed (other fixtures in the league are needed for a full table), just noted.
    }
    if (problems.length) throw AppError.validation(problems);
    return { competition, teams };
  }

  function adminMatch(m) {
    const o = m.toObject ? m.toObject() : m;
    return {
      ...publicMatch({ ...o, report: { ...(o.report || {}), publishedAt: o.report?.publishedAt || null } }),
      events: (o.events || []).map((e) => ({
        id: idString(e._id),
        type: e.type,
        minute: e.minute,
        addedTime: e.addedTime || 0,
        side: e.side,
        player: e.player ? idString(e.player._id ?? e.player) : null,
        playerName: e.playerName || '',
        assist: e.assist ? idString(e.assist._id ?? e.assist) : null,
        assistName: e.assistName || '',
        playerOff: e.playerOff ? idString(e.playerOff._id ?? e.playerOff) : null,
        playerOffName: e.playerOffName || '',
        note: e.note || '',
      })),
      lineups: {
        home: (o.lineups?.home || []).map((l) => ({ player: idString(l.player?._id ?? l.player), starter: l.starter, minutes: l.minutes ?? null, shirtNumber: l.shirtNumber ?? null })),
        away: (o.lineups?.away || []).map((l) => ({ player: idString(l.player?._id ?? l.player), starter: l.starter, minutes: l.minutes ?? null, shirtNumber: l.shirtNumber ?? null })),
      },
      stats: o.stats || {},
      score: o.score || {},
      report: { title: o.report?.title || '', body: o.report?.body || '', publishedAt: o.report?.publishedAt || null },
      countsForStandings: o.countsForStandings !== false,
      resultStands: Boolean(o.resultStands),
      resultRecordedAt: o.resultRecordedAt || null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  }

  admin.get(
    '/',
    auth.requirePermission('matches.manage', 'matches.report'),
    validate({ query: listQuery.extend({ q: z.string().max(100).optional(), state: z.enum(MATCH_STATUSES).optional() }) }),
    async (req, res) => {
      const q = req.valid.query;
      const scope = has(req.auth, 'matches.manage') ? 'matches.manage' : 'matches.report';
      const filter = { deletedAt: null, ...matchScopeFilter(req.auth, scope) };
      if (q.competition) filter.competition = q.competition;
      if (q.season) filter.season = q.season;
      if (q.state) filter.status = q.state;
      else if (q.status === 'upcoming') filter.status = { $in: ['scheduled', 'postponed', 'live'] };
      else if (q.status === 'completed') filter.status = { $in: ['completed', 'abandoned'] };
      if (q.team) {
        const teamFilter = { $or: [{ homeTeam: q.team }, { awayTeam: q.team }] };
        if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, teamFilter];
          delete filter.$or;
        } else Object.assign(filter, teamFilter);
      }
      const paging = getPaging(q, { defaultLimit: 30 });
      const result = await findPaged(Match, filter, paging, (qq) =>
        qq.sort({ kickoffAt: q.status === 'upcoming' ? 1 : -1 }).populate(MATCH_POPULATE),
      );
      res.json({
        data: {
          ...result,
          items: result.items.map((m) => ({ ...matchSummary(m), score: m.score, hasReport: Boolean(m.report?.body), reportPublished: Boolean(m.report?.publishedAt) })),
        },
      });
    },
  );

  admin.get('/:id', auth.requirePermission('matches.manage', 'matches.report'), validate({ params: idParams }), async (req, res) => {
    const permission = has(req.auth, 'matches.manage') ? 'matches.manage' : 'matches.report';
    const match = await loadForEdit(req, permission);
    await match.populate([{ path: 'highlightsVideo' }]);
    res.json({ data: adminMatch(match) });
  });

  admin.post('/', auth.requirePermission('matches.manage'), validate({ body: detailsSchema }), async (req, res) => {
    const body = req.valid.body;
    assertAccess(canAccessMatch(req.auth, 'matches.manage', body), 'You can only create fixtures for teams assigned to you.');
    const { competition } = await checkDetailRefs(body);
    const match = await Match.create({ ...body, createdBy: req.auth.user._id, countsForStandings: competition.type !== 'friendly' });
    await Competition.updateOne({ _id: body.competition }, { $addToSet: { teams: { $each: [body.homeTeam, body.awayTeam] }, seasons: body.season } });
    await match.populate(MATCH_POPULATE);
    await audit(req, { action: 'match.created', entityType: 'Match', entityId: match._id, metadata: { fixture: describeMatch(match), kickoffAt: body.kickoffAt } });
    const clubTeams = [match.homeTeam, match.awayTeam].filter((t) => t?.isClubTeam).map((t) => t._id);
    await notifications.notify(await teamMemberUserIds(clubTeams), {
      type: 'fixture.created',
      title: 'New fixture',
      body: `${describeMatch(match)} has been scheduled.`,
      link: `/matches/${match._id}`,
    });
    res.status(201).json({ data: adminMatch(match) });
  });

  admin.put('/:id', auth.requirePermission('matches.manage'), validate({ params: idParams, body: detailsSchema }), async (req, res) => {
    const match = await loadForEdit(req);
    const body = req.valid.body;
    assertAccess(canAccessMatch(req.auth, 'matches.manage', body), 'You can only move fixtures between teams assigned to you.');
    await checkDetailRefs(body);
    if (['completed', 'abandoned'].includes(match.status) && body.status !== 'live') {
      // Keep a recorded result unless the details form explicitly changes the status.
      body.status = match.status;
    }
    const before = { kickoffAt: match.kickoffAt?.toISOString(), venue: match.venue, status: match.status };
    match.set(body);
    await match.save();
    await match.populate(MATCH_POPULATE);
    const after = { kickoffAt: match.kickoffAt?.toISOString(), venue: match.venue, status: match.status };
    const changed = Object.keys(after).filter((k) => before[k] !== after[k]);
    await audit(req, { action: 'match.updated', entityType: 'Match', entityId: match._id, metadata: { fixture: describeMatch(match), changed, before, after } });
    if (changed.length) {
      const clubTeams = [match.homeTeam, match.awayTeam].filter((t) => t?.isClubTeam).map((t) => t._id);
      const what = changed.includes('status') && ['postponed', 'cancelled'].includes(match.status) ? `has been ${match.status}` : 'has changed';
      await notifications.notify(await teamMemberUserIds(clubTeams), {
        type: 'fixture.changed',
        title: 'Fixture update',
        body: `${describeMatch(match)} ${what}.`,
        link: `/matches/${match._id}`,
      });
    }
    res.json({ data: adminMatch(match) });
  });

  admin.put('/:id/result', auth.requirePermission('matches.manage'), validate({ params: idParams, body: resultSchema }), async (req, res) => {
    const match = await loadForEdit(req);
    const body = req.valid.body;
    if (match.kickoffAt > new Date(Date.now() + 3 * 3600 * 1000) && body.status !== 'live') {
      throw AppError.badRequest('A result cannot be recorded for a match that has not kicked off yet.');
    }
    const home = match.homeTeam;
    const away = match.awayTeam;
    const sideTeam = { home, away };

    // Players referenced in events and line-ups must belong to that side's club team.
    const playerIds = new Set();
    for (const e of body.events) for (const k of ['player', 'assist', 'playerOff']) if (e[k]) playerIds.add(e[k]);
    for (const s of ['home', 'away']) for (const l of body.lineups[s]) playerIds.add(l.player);
    const players = await Player.find({ _id: { $in: [...playerIds] }, deletedAt: null }).select('team').lean();
    const teamOf = new Map(players.map((p) => [idString(p._id), idString(p.team)]));
    const problems = [];
    const checkPlayer = (id, side, path) => {
      if (!id) return;
      if (!teamOf.has(id)) problems.push({ path, message: 'Player not found.' });
      else if (!sideTeam[side]?.isClubTeam) problems.push({ path, message: 'Opposition players are recorded by name, not linked.' });
    };
    body.events.forEach((e, i) => {
      // Own goals are credited to the other side, but the player belongs to e.side.
      checkPlayer(e.player, e.side, `events.${i}.player`);
      checkPlayer(e.assist, e.side, `events.${i}.assist`);
      checkPlayer(e.playerOff, e.side, `events.${i}.playerOff`);
      if (!e.player && !e.playerName && e.type !== 'substitution') problems.push({ path: `events.${i}.player`, message: 'Choose a player or enter a name.' });
    });
    for (const s of ['home', 'away']) body.lineups[s].forEach((l, i) => checkPlayer(l.player, s, `lineups.${s}.${i}.player`));

    const goals = { home: 0, away: 0 };
    for (const e of body.events) {
      if (e.type === 'goal' || e.type === 'penalty_goal') goals[e.side] += 1;
      if (e.type === 'own_goal') goals[e.side === 'home' ? 'away' : 'home'] += 1;
    }
    const anyGoals = goals.home + goals.away > 0;
    if (anyGoals && body.status === 'completed' && (goals.home !== body.score.home || goals.away !== body.score.away)) {
      problems.push({
        path: 'score',
        message: `The goals listed (${goals.home}–${goals.away}) do not match the score (${body.score.home}–${body.score.away}).`,
      });
    }
    if (problems.length) throw AppError.validation(problems);

    const firstTime = !['completed', 'abandoned'].includes(match.status);
    const previous = { status: match.status, score: { home: match.score?.home, away: match.score?.away } };
    match.status = body.status;
    match.score = body.score;
    match.events = body.events;
    match.lineups = body.lineups;
    match.stats = body.stats;
    match.resultRecordedAt = new Date();
    match.resultRecordedBy = req.auth.user._id;
    await withTransaction(async (session) => {
      await match.save({ session });
    });
    await match.populate(DETAIL_POPULATE.filter((p) => !MATCH_POPULATE.includes(p)));
    await audit(req, {
      action: firstTime ? 'match.result_recorded' : 'match.result_changed',
      entityType: 'Match',
      entityId: match._id,
      metadata: { fixture: describeMatch(match), previous, score: body.score, status: body.status, events: body.events.length },
    });
    if (body.status === 'completed' && firstTime) {
      const clubTeams = [home, away].filter((t) => t?.isClubTeam).map((t) => t._id);
      await notifications.notify(await teamMemberUserIds(clubTeams), {
        type: 'match.result',
        title: 'Match result',
        body: `${home.name} ${body.score.home}–${body.score.away} ${away.name}`,
        link: `/matches/${match._id}`,
      });
    }
    res.json({ data: adminMatch(match) });
  });

  admin.put('/:id/report', auth.requirePermission('matches.report', 'matches.manage'), validate({ params: idParams, body: reportSchema }), async (req, res) => {
    const permission = has(req.auth, 'matches.report') ? 'matches.report' : 'matches.manage';
    const match = await loadForEdit(req, permission);
    const { title, body, publish } = req.valid.body;
    if (publish && !['completed', 'abandoned'].includes(match.status)) {
      throw AppError.badRequest('Match reports can be published once the result has been recorded.');
    }
    const wasPublished = Boolean(match.report?.publishedAt);
    match.report = {
      title,
      body,
      author: req.auth.user._id,
      publishedAt: publish ? match.report?.publishedAt || new Date() : null,
    };
    await match.save();
    await audit(req, {
      action: publish && !wasPublished ? 'match.report_published' : !publish && wasPublished ? 'match.report_unpublished' : 'match.report_saved',
      entityType: 'Match',
      entityId: match._id,
    });
    res.json({ data: adminMatch(match) });
  });

  admin.put('/:id/highlights', auth.requirePermission('matches.manage', 'media.manage'), validate({ params: idParams, body: z.object({ video: objectId.nullable() }) }), async (req, res) => {
    const match = await Match.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!match) throw AppError.notFound('Match not found.');
    if (req.permission === 'matches.manage') assertAccess(canAccessMatch(req.auth, 'matches.manage', match));
    if (req.valid.body.video && !(await Video.exists({ _id: req.valid.body.video }))) throw AppError.validation([{ path: 'video', message: 'Video not found.' }]);
    match.highlightsVideo = req.valid.body.video;
    await match.save();
    await audit(req, { action: 'match.highlights_linked', entityType: 'Match', entityId: match._id, metadata: { video: req.valid.body.video } });
    res.json({ data: { id: idString(match._id), highlightsVideo: req.valid.body.video } });
  });

  // Audited decision whether a match counts toward the table.
  admin.patch('/:id/standings', auth.requirePermission('standings.override'), validate({ params: idParams, body: standingsSchema }), async (req, res) => {
    const match = await Match.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!match) throw AppError.notFound('Match not found.');
    const before = { countsForStandings: match.countsForStandings, resultStands: match.resultStands };
    match.countsForStandings = req.valid.body.countsForStandings;
    match.resultStands = match.status === 'abandoned' ? req.valid.body.resultStands : false;
    await match.save();
    await audit(req, {
      action: 'standings.match_decision',
      entityType: 'Match',
      entityId: match._id,
      metadata: { before, after: { countsForStandings: match.countsForStandings, resultStands: match.resultStands }, reason: req.valid.body.reason },
    });
    res.json({ data: { countsForStandings: match.countsForStandings, resultStands: match.resultStands } });
  });

  admin.delete('/:id', auth.requirePermission('matches.manage'), validate({ params: idParams }), async (req, res) => {
    const match = await loadForEdit(req);
    if (req.scope !== 'all') throw AppError.forbidden('Only staff with club-wide match access can delete fixtures.');
    if (['completed', 'abandoned'].includes(match.status)) {
      throw AppError.conflict('Played matches are part of club history and cannot be deleted. Change the result or exclude it from the table instead.');
    }
    match.deletedAt = new Date();
    match.deletedBy = req.auth.user._id;
    await match.save();
    await audit(req, { action: 'match.deleted', entityType: 'Match', entityId: match._id, metadata: { fixture: describeMatch(match) } });
    res.json({ data: { id: idString(match._id) } });
  });

  return { pub, admin };
}

