import { Match, StandingsAdjustment, Team } from '../models/index.js';
import { idString } from '../utils/ids.js';
import { teamSummary } from '../serializers/index.js';

/** Matches that count toward the table: completed (unless excluded) or abandoned with an audited "result stands". */
export function countingMatchFilter(competitionId, seasonId) {
  return {
    competition: competitionId,
    season: seasonId,
    deletedAt: null,
    'score.home': { $ne: null },
    'score.away': { $ne: null },
    $or: [
      { status: 'completed', countsForStandings: { $ne: false } },
      { status: 'abandoned', resultStands: true },
    ],
  };
}

function blankRow(team) {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, form: [], adjustment: null };
}

/**
 * Calculates a league table from match results, then applies explicit audited adjustments.
 * Points and tie-breakers come from the competition's rules (configuration, not code).
 */
export async function calculateStandings(competition, seasonId) {
  const rules = competition.rules || {};
  if (competition.type === 'friendly' || rules.countsForStandings === false) {
    return { applicable: false, rows: [], adjustments: [] };
  }
  const pts = { W: rules.pointsWin ?? 3, D: rules.pointsDraw ?? 1, L: rules.pointsLoss ?? 0 };

  const [matches, adjustments] = await Promise.all([
    Match.find(countingMatchFilter(competition._id, seasonId)).select('homeTeam awayTeam score kickoffAt').sort({ kickoffAt: 1 }).lean(),
    StandingsAdjustment.find({ competition: competition._id, season: seasonId, revokedAt: null }).lean(),
  ]);

  const teamIds = new Set((competition.teams || []).map(idString));
  for (const m of matches) {
    teamIds.add(idString(m.homeTeam));
    teamIds.add(idString(m.awayTeam));
  }
  const teams = await Team.find({ _id: { $in: [...teamIds] } }).lean();
  const rows = new Map(teams.map((t) => [idString(t._id), blankRow(teamSummary(t))]));

  // Head-to-head points: h2h[a][b] = points a earned against b.
  const h2h = new Map();
  const addH2h = (a, b, p) => {
    if (!h2h.has(a)) h2h.set(a, new Map());
    h2h.get(a).set(b, (h2h.get(a).get(b) || 0) + p);
  };

  for (const m of matches) {
    const home = rows.get(idString(m.homeTeam));
    const away = rows.get(idString(m.awayTeam));
    if (!home || !away) continue;
    const hs = m.score.home;
    const as = m.score.away;
    const hRes = hs > as ? 'W' : hs === as ? 'D' : 'L';
    const aRes = hs < as ? 'W' : hs === as ? 'D' : 'L';
    for (const [row, gf, ga, res] of [
      [home, hs, as, hRes],
      [away, as, hs, aRes],
    ]) {
      row.played += 1;
      row.goalsFor += gf;
      row.goalsAgainst += ga;
      row.points += pts[res];
      if (res === 'W') row.won += 1;
      else if (res === 'D') row.drawn += 1;
      else row.lost += 1;
      row.form.push(res);
    }
    addH2h(home.team.id, away.team.id, pts[hRes]);
    addH2h(away.team.id, home.team.id, pts[aRes]);
  }

  for (const adj of adjustments) {
    const row = rows.get(idString(adj.team));
    if (!row) continue;
    row.points += adj.points || 0;
    row.goalsFor += adj.goalsFor || 0;
    row.goalsAgainst += adj.goalsAgainst || 0;
    row.adjustment = row.adjustment || { points: 0, reasons: [] };
    row.adjustment.points += adj.points || 0;
    row.adjustment.reasons.push(adj.reason);
  }

  const list = [...rows.values()];
  for (const row of list) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    row.form = row.form.slice(-5).reverse(); // most recent first
  }

  const order = rules.tieBreakers?.length ? rules.tieBreakers : ['points', 'goal_difference', 'goals_for', 'name'];
  const withPoints = order.includes('points') ? order : ['points', ...order];
  list.sort((a, b) => {
    for (const key of withPoints) {
      let diff = 0;
      if (key === 'points') diff = b.points - a.points;
      else if (key === 'goal_difference') diff = b.goalDifference - a.goalDifference;
      else if (key === 'goals_for') diff = b.goalsFor - a.goalsFor;
      else if (key === 'wins') diff = b.won - a.won;
      else if (key === 'head_to_head') {
        diff = (h2h.get(b.team.id)?.get(a.team.id) || 0) - (h2h.get(a.team.id)?.get(b.team.id) || 0);
      } else if (key === 'name') diff = a.team.name.localeCompare(b.team.name);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  list.forEach((row, i) => {
    row.position = i + 1;
  });

  return {
    applicable: true,
    rows: list,
    adjustments: adjustments.map((a) => ({
      id: idString(a._id),
      team: idString(a.team),
      points: a.points,
      goalsFor: a.goalsFor,
      goalsAgainst: a.goalsAgainst,
      reason: a.reason,
      createdAt: a.createdAt,
    })),
  };
}
