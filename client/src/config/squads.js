/**
 * The club's two public squads. `value` is what the API stores (Player.squad); `slug` is the
 * address of the squad page (/players/squad/:slug).
 */
export const SQUADS = [
  { value: 'senior', slug: 'senior', label: 'Saki Stars FC Senior', short: 'Senior' },
  { value: 'under19', slug: 'under-19', label: 'Saki Stars FC Under-19', short: 'Under-19' },
];

export const squadBySlug = (slug) => SQUADS.find((s) => s.slug === slug) || null;
export const squadByValue = (value) => SQUADS.find((s) => s.value === value) || null;
export const squadPath = (squad) => `/players/squad/${squad.slug}`;
