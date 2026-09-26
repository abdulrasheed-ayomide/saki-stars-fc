import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { imageUrl } from './media.js';
import { seasonLabel, suggestNewSeason, defaultSeasonId } from './seasons.js';
import { TeamLogo } from '../components/football/TeamLogo.jsx';
import { VIDEO_CATEGORIES } from '../config/categories.js';

const CLD = 'https://res.cloudinary.com/demo/image/upload/v1/club/logo.png';

describe('imageUrl (Cloudinary)', () => {
  it('never sends a gravity with c_pad (Cloudinary answers 400, which broke every logo)', () => {
    const url = imageUrl(CLD, { width: 72, height: 72, crop: 'pad' });
    expect(url).toContain('c_pad');
    expect(url).not.toMatch(/g_auto|g_/);
  });
  it('keeps smart cropping for photos (c_fill,g_auto), as the hero image uses', () => {
    expect(imageUrl(CLD, { width: 800, height: 400 })).toContain('c_fill,g_auto');
  });
  it('leaves non-Cloudinary URLs alone', () => {
    expect(imageUrl('/logo.png', { width: 10, height: 10, crop: 'pad' })).toBe('/logo.png');
  });
});

describe('TeamLogo', () => {
  it('falls back to a clean badge when the image fails, never a broken "?" image', () => {
    const { container } = render(<TeamLogo team={{ name: 'Saki Stars', logo: { url: CLD } }} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: /Saki Stars \(team logo unavailable\)/ })).toHaveTextContent('SS');
  });
  it('shows a shield icon (not "?") for a team without a name or logo', () => {
    render(<TeamLogo team={{}} />);
    const badge = screen.getByRole('img', { name: 'Team logo unavailable' });
    expect(badge.textContent).not.toContain('?');
    expect(badge.querySelector('svg')).toBeTruthy();
  });
});

describe('seasons', () => {
  const all = [
    { id: 'a', name: '2027', startDate: '2027-01-01', isCurrent: false },
    { id: 'b', name: '2026', startDate: '2026-01-01', isCurrent: true },
    { id: 'c', name: '2025', startDate: '2025-01-01', isCurrent: false },
  ];
  it('labels current, previous and upcoming seasons', () => {
    expect(all.map((s) => seasonLabel(s, all))).toEqual(['2027 — Upcoming', '2026 — Current', '2025 — Previous']);
  });
  it('preselects the current season and suggests the next free year', () => {
    expect(defaultSeasonId(all)).toBe('b');
    expect(suggestNewSeason(all, new Date('2026-05-01'))).toEqual({ name: '2028', startDate: '2028-01-01', endDate: '2028-12-31' });
    expect(suggestNewSeason([], new Date('2026-05-01')).name).toBe('2026');
  });
});

describe('video categories', () => {
  it('uses the exact competition names and no longer offers plain "Youth"', () => {
    expect(VIDEO_CATEGORIES).toContain('Nigeria Nationwide League One (NLO)');
    expect(VIDEO_CATEGORIES).toContain('Nigeria Youth League (NYL)');
    expect(VIDEO_CATEGORIES).not.toContain('Youth');
  });
});
