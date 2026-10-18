import { SQUADS, squadPath } from './squads.js';

// Main public navigation. An item with `children` opens a small menu instead of a page.
export const mainNavigation = [
  { label: 'Home', to: '/' },
  { label: 'Club', to: '/club' },
  { label: 'Teams', to: '/teams' },
  { label: 'Players', to: '/players', children: SQUADS.map((s) => ({ label: s.label, to: squadPath(s) })) },
  { label: 'Fixtures & Results', to: '/fixtures-results' },
  { label: 'Competitions', to: '/competitions' },
  { label: 'News', to: '/news' },
  { label: 'Videos', to: '/videos' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'Staff', to: '/staff' },
  { label: 'Contact', to: '/contact' },
];

export const legalNavigation = [
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms of Use', to: '/terms' },
  { label: 'Cookie Policy', to: '/cookie-policy' },
];
