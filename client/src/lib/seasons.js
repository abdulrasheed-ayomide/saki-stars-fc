/**
 * Season display helpers. Seasons are separate database records (2026, 2027, … or 2026/27);
 * exactly one is marked current. Labels make the current one obvious in every dropdown:
 *   "2026 — Current", "2025 — Previous", "2027 — Upcoming".
 */
export function seasonStatusLabel(season, all = []) {
  if (!season) return '';
  if (season.isCurrent) return 'Current';
  const current = all.find((s) => s.isCurrent);
  const ref = current ? new Date(current.startDate) : new Date();
  return new Date(season.startDate) > ref ? 'Upcoming' : 'Previous';
}

export function seasonLabel(season, all = []) {
  if (!season) return '';
  const status = seasonStatusLabel(season, all);
  return status ? `${season.name} — ${status}` : season.name;
}

/** The season to preselect in forms: the current one, else the most recent. */
export function defaultSeasonId(all = []) {
  return (all.find((s) => s.isCurrent) || all[0])?.id || '';
}

/**
 * Suggests the next season to create: the first calendar year from this year onwards
 * that does not exist yet, as a January–December season (e.g. "2027").
 */
export function suggestNewSeason(existing = [], today = new Date()) {
  const names = new Set(existing.map((s) => String(s.name).trim()));
  let year = today.getFullYear();
  while (names.has(String(year))) year += 1;
  return { name: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}
