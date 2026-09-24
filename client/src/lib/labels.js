export const STAFF_ROLE_LABELS = {
  director: 'Club Director',
  chairman: 'Club Chairman',
  consultant: 'Club Consultant',
  team_manager: 'Team Manager',
  it_manager: 'IT Manager',
  media_officer: 'Media Officer',
  scout: 'Team Scout',
  other: 'Staff',
};

export const APPLY_ROLES = ['chairman', 'consultant', 'team_manager', 'it_manager', 'media_officer', 'scout'];

export const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

export const MATCH_STATUS_LABELS = {
  scheduled: 'Scheduled',
  live: 'Live',
  completed: 'Full time',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
  abandoned: 'Abandoned',
};

export const EVENT_LABELS = {
  goal: 'Goal',
  penalty_goal: 'Penalty',
  own_goal: 'Own goal',
  penalty_miss: 'Missed penalty',
  yellow_card: 'Yellow card',
  second_yellow: 'Second yellow',
  red_card: 'Red card',
  substitution: 'Substitution',
};

export const SCOPE_LABELS = {
  all: 'Whole club',
  assigned_teams: 'Assigned teams only',
  assigned_players: 'Assigned players only',
  own: 'Own records only',
};

export const USER_STATUS_LABELS = {
  pending: 'Email not confirmed',
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
  rejected: 'Rejected',
};

export const STAT_LABELS = [
  ['appearances', 'Apps'],
  ['starts', 'Starts'],
  ['minutes', 'Minutes'],
  ['goals', 'Goals'],
  ['assists', 'Assists'],
  ['yellowCards', 'Yellow'],
  ['redCards', 'Red'],
];

export function titleCase(s = '') {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
