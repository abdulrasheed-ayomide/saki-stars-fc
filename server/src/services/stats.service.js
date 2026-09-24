import { Match } from '../models/index.js';
import { idString } from '../utils/ids.js';

const GOAL_TYPES = new Set(['goal', 'penalty_goal']);

function emptyStats() {
  return { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
}

/**
 * Player statistics calculated from completed matches only (never stored, never invented).
 * Returns Map<playerId, stats>.
 */
export async function playerStats(playerIds, { season, competition } = {}) {
  const ids = playerIds.map(idString).filter(Boolean);
  const result = new Map(ids.map((id) => [id, emptyStats()]));
  if (ids.length === 0) return result;

  const filter = {
    status: 'completed',
    deletedAt: null,
    $or: [
      { 'lineups.home.player': { $in: ids } },
      { 'lineups.away.player': { $in: ids } },
      { 'events.player': { $in: ids } },
      { 'events.assist': { $in: ids } },
    ],
  };
  if (season) filter.season = season;
  if (competition) filter.competition = competition;

  const matches = await Match.find(filter).select('lineups events').lean();
  for (const m of matches) {
    const appeared = new Set();
    for (const side of ['home', 'away']) {
      for (const entry of m.lineups?.[side] || []) {
        const id = idString(entry.player);
        const s = result.get(id);
        if (!s) continue;
        appeared.add(id);
        if (entry.starter) s.starts += 1;
        if (entry.minutes != null) s.minutes += entry.minutes;
      }
    }
    for (const e of m.events || []) {
      const pid = idString(e.player);
      const s = result.get(pid);
      if (s) {
        if (GOAL_TYPES.has(e.type)) s.goals += 1;
        if (e.type === 'yellow_card') s.yellowCards += 1;
        if (e.type === 'red_card' || e.type === 'second_yellow') s.redCards += 1;
        // A scorer or substitute who is missing from the recorded line-up still appeared.
        if (GOAL_TYPES.has(e.type) || e.type === 'substitution') appeared.add(pid);
      }
      const aid = idString(e.assist);
      const a = result.get(aid);
      if (a && GOAL_TYPES.has(e.type)) {
        a.assists += 1;
        appeared.add(aid);
      }
    }
    for (const id of appeared) result.get(id).appearances += 1;
  }
  return result;
}

/** Adds officially recorded historical totals (from before this system) to career stats. */
export function withAdjustments(stats, player) {
  const adj = player?.statAdjustments;
  if (!adj) return stats;
  return {
    ...stats,
    appearances: stats.appearances + (adj.appearances || 0),
    goals: stats.goals + (adj.goals || 0),
    assists: stats.assists + (adj.assists || 0),
  };
}

/** Results summary for a team from completed matches. */
export async function teamRecord(teamId, { season, competition } = {}) {
  const filter = { status: 'completed', deletedAt: null, $or: [{ homeTeam: teamId }, { awayTeam: teamId }] };
  if (season) filter.season = season;
  if (competition) filter.competition = competition;
  const matches = await Match.find(filter).select('homeTeam awayTeam score kickoffAt').sort({ kickoffAt: -1 }).lean();
  const r = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, form: [] };
  for (const m of matches) {
    if (m.score?.home == null || m.score?.away == null) continue;
    const home = idString(m.homeTeam) === idString(teamId);
    const gf = home ? m.score.home : m.score.away;
    const ga = home ? m.score.away : m.score.home;
    r.played += 1;
    r.goalsFor += gf;
    r.goalsAgainst += ga;
    if (ga === 0) r.cleanSheets += 1;
    const outcome = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    if (outcome === 'W') r.won += 1;
    else if (outcome === 'D') r.drawn += 1;
    else r.lost += 1;
    if (r.form.length < 5) r.form.push(outcome);
  }
  r.goalDifference = r.goalsFor - r.goalsAgainst;
  return r;
}
