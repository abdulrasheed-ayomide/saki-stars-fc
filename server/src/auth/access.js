import { AppError } from '../utils/AppError.js';
import { idString } from '../utils/ids.js';

/**
 * Scope helpers. A handler first passes requirePermission(), then uses these to check
 * the specific team/player/record it is about to read or change.
 */

export function scopeOf(auth, permission) {
  return auth?.grants?.get(permission) ?? null;
}

export function has(auth, permission) {
  return Boolean(scopeOf(auth, permission));
}

export function canAccessTeam(auth, permission, teamId) {
  const scope = scopeOf(auth, permission);
  if (!scope) return false;
  if (scope === 'all') return true;
  if (scope === 'assigned_teams') return Boolean(teamId) && auth.assignedTeams.has(idString(teamId));
  return false;
}

export function canAccessPlayer(auth, permission, player) {
  const scope = scopeOf(auth, permission);
  if (!scope || !player) return false;
  if (scope === 'all') return true;
  if (scope === 'assigned_teams') return Boolean(player.team) && auth.assignedTeams.has(idString(player.team));
  if (scope === 'assigned_players') return auth.assignedPlayers.has(idString(player._id));
  return false;
}

export function canAccessMatch(auth, permission, match) {
  const scope = scopeOf(auth, permission);
  if (!scope || !match) return false;
  if (scope === 'all') return true;
  if (scope === 'assigned_teams') {
    return auth.assignedTeams.has(idString(match.homeTeam)) || auth.assignedTeams.has(idString(match.awayTeam));
  }
  return false;
}

/** Mongo filter limiting players to the caller's scope for `permission`. */
export function playerScopeFilter(auth, permission) {
  const scope = scopeOf(auth, permission);
  if (scope === 'all') return {};
  if (scope === 'assigned_teams') return { team: { $in: [...auth.assignedTeams] } };
  if (scope === 'assigned_players') return { _id: { $in: [...auth.assignedPlayers] } };
  return { _id: { $in: [] } };
}

/** Mongo filter limiting matches to the caller's scope for `permission`. */
export function matchScopeFilter(auth, permission) {
  const scope = scopeOf(auth, permission);
  if (scope === 'all') return {};
  if (scope === 'assigned_teams') {
    const teams = [...auth.assignedTeams];
    return { $or: [{ homeTeam: { $in: teams } }, { awayTeam: { $in: teams } }] };
  }
  return { _id: { $in: [] } };
}

export function assertAccess(allowed, message) {
  if (!allowed) throw AppError.forbidden(message || 'This is outside the teams or players assigned to you.', 'OUT_OF_SCOPE');
}

/** Grants as a plain list for API responses and the dashboard UI. */
export function grantsList(auth) {
  return [...(auth?.grants?.entries() ?? [])].map(([permission, scope]) => ({ permission, scope }));
}
