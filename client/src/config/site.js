/**
 * Build-time site configuration. The club's real identity (name, logo, contact details) comes
 * from Club Settings in the database; these names are only shown before settings load.
 */
export const site = Object.freeze({
  clubName: import.meta.env.VITE_CLUB_NAME || 'Saki Stars Sports Club',
  clubShortName: import.meta.env.VITE_CLUB_SHORT_NAME || 'Saki Stars',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, ''),
});
