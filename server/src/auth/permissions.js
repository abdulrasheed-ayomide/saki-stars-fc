/**
 * Role + Permission + Scope catalogue.
 *
 * A staff member's effective access is a list of grants: { permission, scope }.
 * The backend checks every protected request against these grants; the frontend
 * uses the same list only to decide what to show.
 */

export const SCOPES = Object.freeze({
  ALL: 'all',
  ASSIGNED_TEAMS: 'assigned_teams',
  ASSIGNED_PLAYERS: 'assigned_players',
  OWN: 'own',
});

// Broader scopes first. A grant's scope covers every narrower one after it.
export const SCOPE_ORDER = [SCOPES.ALL, SCOPES.ASSIGNED_TEAMS, SCOPES.ASSIGNED_PLAYERS, SCOPES.OWN];

const A = SCOPES.ALL;
const T = SCOPES.ASSIGNED_TEAMS;
const P = SCOPES.ASSIGNED_PLAYERS;
const O = SCOPES.OWN;

export const PERMISSIONS = Object.freeze({
  'dashboard.view': { group: 'General', label: 'Open the staff dashboard', scopes: [A] },

  'users.view': { group: 'Users', label: 'View user accounts', scopes: [A] },
  'users.manage': { group: 'Users', label: 'Suspend, reactivate and deactivate non-staff accounts; revoke sessions', scopes: [A] },

  'applications.players.review': { group: 'Applications', label: 'Approve or reject player applications', scopes: [A] },
  'applications.staff.review': { group: 'Applications', label: 'Approve or reject staff applications', scopes: [A] },

  'staff.view': { group: 'Staff', label: 'View staff members', scopes: [A] },
  'staff.manage': { group: 'Staff', label: 'Assign staff roles, permissions and scope; suspend staff', scopes: [A] },
  'staff.profiles.manage': { group: 'Staff', label: 'Edit public staff profiles and website visibility', scopes: [A] },

  'players.view': { group: 'Players', label: 'View player records', scopes: [A, T, P] },
  'players.create': { group: 'Players', label: 'Create player records', scopes: [A] },
  'players.edit': { group: 'Players', label: 'Edit player football data and public profile', scopes: [A, T] },
  'players.sensitive.view': { group: 'Players', label: 'View restricted player data (contacts, emergency contact, documents)', scopes: [A, T] },
  'players.highly_sensitive.view': { group: 'Players', label: 'View highly sensitive player data (national ID, medical)', scopes: [A] },

  'teams.manage': { group: 'Football', label: 'Create and edit teams', scopes: [A] },
  'competitions.manage': { group: 'Football', label: 'Create and edit competitions and seasons', scopes: [A] },
  'matches.manage': { group: 'Football', label: 'Create fixtures and record results', scopes: [A, T] },
  'matches.report': { group: 'Football', label: 'Write and publish match reports', scopes: [A, T] },
  'standings.override': { group: 'Football', label: 'Apply audited standings corrections', scopes: [A] },

  'news.create': { group: 'Content', label: 'Write news and submit for review', scopes: [A] },
  'news.edit': { group: 'Content', label: "Edit other people's news articles", scopes: [A] },
  'news.publish': { group: 'Content', label: 'Publish and archive news', scopes: [A] },
  'news.delete': { group: 'Content', label: 'Delete news articles', scopes: [A] },
  'media.manage': { group: 'Content', label: 'Manage videos, gallery and uploads', scopes: [A] },
  'comments.moderate': { group: 'Content', label: 'Moderate comments', scopes: [A] },
  'announcements.send': { group: 'Content', label: 'Send announcements and notifications', scopes: [A] },

  'reports.create': { group: 'Reports', label: 'Submit staff reports', scopes: [A] },
  'reports.view': { group: 'Reports', label: 'View staff reports', scopes: [A, T, O] },
  'reports.review': { group: 'Reports', label: 'Review staff reports', scopes: [A] },

  'scouting.view': { group: 'Scouting', label: 'View scouting reports and assignments', scopes: [A, O] },
  'scouting.manage': { group: 'Scouting', label: 'Write scouting reports', scopes: [A, O] },
  'scouting.assign': { group: 'Scouting', label: 'Assign scouting targets to scouts', scopes: [A] },

  'contact.view': { group: 'Operations', label: 'Read contact messages and newsletter subscribers', scopes: [A] },
  'audit.view': { group: 'Operations', label: 'View audit logs', scopes: [A] },
  'settings.manage': { group: 'Operations', label: 'Edit club information, website content and legal text', scopes: [A] },
  'system.view': { group: 'Operations', label: 'View system health and technical configuration', scopes: [A] },
});

export const PERMISSION_KEYS = Object.freeze(Object.keys(PERMISSIONS));

export const STAFF_ROLES = Object.freeze({
  director: { label: 'Club Director', publicByDefault: true },
  chairman: { label: 'Club Chairman', publicByDefault: true },
  consultant: { label: 'Club Consultant', publicByDefault: true },
  team_manager: { label: 'Team Manager', publicByDefault: true },
  it_manager: { label: 'IT Manager', publicByDefault: false },
  media_officer: { label: 'Media Officer', publicByDefault: false },
  scout: { label: 'Team Scout', publicByDefault: false },
});

export const STAFF_ROLE_KEYS = Object.freeze(Object.keys(STAFF_ROLES));

const g = (permission, scope = A) => ({ permission, scope });

/**
 * Recommended starting permissions per role. The Director can adjust them per person.
 * The Director is not listed: Directors always hold every permission with scope "all".
 */
export const DEFAULT_GRANTS = Object.freeze({
  chairman: [
    g('dashboard.view'),
    g('players.view'),
    g('staff.view'),
    g('reports.create'),
    g('reports.view'),
    g('audit.view'),
  ],
  consultant: [g('dashboard.view'), g('players.view'), g('reports.create'), g('reports.view', O)],
  team_manager: [
    g('dashboard.view'),
    g('players.view', T),
    g('players.edit', T),
    g('players.sensitive.view', T),
    g('matches.manage', T),
    g('matches.report', T),
    g('reports.create'),
    g('reports.view', O),
  ],
  it_manager: [
    g('dashboard.view'),
    g('users.view'),
    g('users.manage'),
    g('audit.view'),
    g('system.view'),
    g('reports.create'),
    g('reports.view', O),
  ],
  media_officer: [
    g('dashboard.view'),
    g('news.create'),
    g('news.edit'),
    g('news.publish'),
    g('media.manage'),
    g('comments.moderate'),
    g('reports.create'),
    g('reports.view', O),
  ],
  scout: [
    g('dashboard.view'),
    g('players.view', P),
    g('scouting.view', O),
    g('scouting.manage', O),
    g('reports.create'),
    g('reports.view', O),
  ],
});

export function isValidGrant({ permission, scope }) {
  const def = PERMISSIONS[permission];
  return Boolean(def && def.scopes.includes(scope));
}

/** True when scope `a` covers scope `b` (e.g. "all" covers "assigned_teams"). */
export function scopeCovers(a, b) {
  const ia = SCOPE_ORDER.indexOf(a);
  const ib = SCOPE_ORDER.indexOf(b);
  return ia !== -1 && ib !== -1 && ia <= ib;
}

/** Map of permission -> broadest scope held. */
export function resolveGrants({ staffRole, grants = [] }) {
  const map = new Map();
  if (staffRole === 'director') {
    for (const key of PERMISSION_KEYS) map.set(key, A);
    return map;
  }
  for (const { permission, scope } of grants) {
    if (!isValidGrant({ permission, scope })) continue;
    const current = map.get(permission);
    if (!current || scopeCovers(scope, current)) map.set(permission, scope);
  }
  return map;
}
