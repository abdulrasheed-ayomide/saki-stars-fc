import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderRoute } from '../test/renderRoute.jsx';
import { MatchMediaActions } from '../components/football/MatchMediaActions.jsx';
import { MatchScorers } from '../components/football/MatchScorers.jsx';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const page = (items) => ({ items, page: 1, limit: 48, total: items.length, pages: items.length ? 1 : 0, categories: [] });

/** Fake API. `routes` maps "METHOD /path" regexes to handlers; anything else is empty. */
function fakeApi(routes = {}) {
  return vi.fn(async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const key = `${(init.method || 'GET').toUpperCase()} ${path}`;
    for (const [pattern, handler] of Object.entries(routes)) if (new RegExp(pattern).test(key)) return handler(url);
    if (path === '/auth/refresh') return json({ data: null });
    if (path === '/settings') return json({ data: { name: 'Saki Stars Sports Club', shortName: 'Saki Stars' } });
    if (/^\/matches\/(next|latest-result)$/.test(path)) return json({ data: null });
    if (/^\/(teams|staff|competitions|seasons)$/.test(path)) return json({ data: [] });
    if (/^\/(players|news|videos|gallery|matches)$/.test(path)) return json({ data: page([]) });
    return json({ data: {} });
  });
}

const player = (id, name, squad) => ({ id, slug: id, name, position: 'Forward', jerseyNumber: null, photo: null, team: null, squad, nationality: '' });
const calls = (fetchMock, pathname) =>
  fetchMock.mock.calls.map(([input]) => new URL(typeof input === 'string' ? input : input.url, 'http://localhost')).filter((u) => u.pathname === `/api/v1${pathname}`);

afterEach(() => vi.unstubAllGlobals());

describe('Players menu with two squads', () => {
  it('opens a dropdown with exactly the two squads; Escape and outside clicks close it', async () => {
    vi.stubGlobal('fetch', fakeApi());
    const user = userEvent.setup();
    renderRoute('/');
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0];
    const button = await within(nav).findByRole('button', { name: 'Players' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const list = document.getElementById(button.getAttribute('aria-controls'));
    expect(within(list).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Saki Stars FC Senior', '/players/squad/senior'],
      ['Saki Stars FC Under-19', '/players/squad/under-19'],
    ]);

    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();

    await user.click(button);
    fireEvent.pointerDown(document.body);
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // Keyboard: Arrow Down opens and moves into the list.
    button.focus();
    await user.keyboard('{ArrowDown}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(within(list).getAllByRole('link')[0]).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(within(list).getAllByRole('link')[1]).toHaveFocus();
  });

  it('choosing a squad shows only that squad (squad filter sent to the API) and closes the menu', async () => {
    const fetchMock = fakeApi({
      '^GET /players$': (url) =>
        json({ data: page(url.searchParams.get('squad') === 'under19' ? [player('ayo', 'Ayo Young', 'under19')] : [player('musa', 'Musa Okon', 'senior')]) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { router } = renderRoute('/');
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0];
    const button = await within(nav).findByRole('button', { name: 'Players' });
    await user.click(button);
    await user.click(within(nav).getByRole('link', { name: 'Saki Stars FC Under-19' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/players/squad/under-19'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Saki Stars FC Under-19' })).toBeInTheDocument();
    expect(await screen.findByText('Ayo Young')).toBeInTheDocument();
    expect(screen.queryByText('Musa Okon')).not.toBeInTheDocument();
    expect(calls(fetchMock, '/players').some((u) => u.searchParams.get('squad') === 'under19')).toBe(true);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // Existing profile links keep working.
    expect(screen.getByRole('link', { name: /ayo young/i })).toHaveAttribute('href', '/players/ayo');
  });

  it('works in the mobile menu with touch/keyboard and closes the menu after choosing', async () => {
    vi.stubGlobal('fetch', fakeApi());
    const user = userEvent.setup();
    const { router } = renderRoute('/');
    await user.click(await screen.findByRole('button', { name: /open menu/i }));
    const dialog = screen.getByRole('dialog', { name: /main menu/i });
    const group = within(dialog).getByRole('button', { name: 'Players' });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByRole('link', { name: 'Saki Stars FC Senior' })).not.toBeInTheDocument();
    group.focus();
    await user.keyboard('{Enter}');
    expect(group).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(dialog).getByRole('link', { name: 'Saki Stars FC Senior' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/players/squad/senior');
  });

  it('supports direct links and refresh on squad pages, with empty, error and 404 states', async () => {
    vi.stubGlobal('fetch', fakeApi());
    const { unmount } = renderRoute('/players/squad/senior');
    expect(await screen.findByRole('heading', { level: 1, name: 'Saki Stars FC Senior' })).toBeInTheDocument();
    expect(await screen.findByText(/no players in the senior squad yet/i)).toBeInTheDocument();
    unmount();

    vi.stubGlobal('fetch', fakeApi({ '^GET /players$': () => json({ error: { code: 'SERVER_ERROR', message: 'Down' } }, 500) }));
    const second = renderRoute('/players/squad/under-19');
    expect(await screen.findByRole('heading', { level: 1, name: 'Saki Stars FC Under-19' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    second.unmount();

    renderRoute('/players/squad/reserves');
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});

describe('landing-page competitions', () => {
  const comp = (n, extra = {}) => ({ id: `c${n}`, slug: `comp-${n}`, name: `Competition ${n}`, type: 'league', logo: null, ...extra });
  const rows = (count) =>
    Array.from({ length: count }, (_, i) => ({
      position: i + 1,
      team: { id: `t${i + 1}`, slug: `team-${i + 1}`, name: `Team ${i + 1}`, shortName: '', logo: null, isClubTeam: i === 2 },
      played: 8, won: 8 - i, drawn: 0, lost: i, goalsFor: 20 - i, goalsAgainst: 5 + i, goalDifference: 15 - 2 * i, points: 24 - 3 * i, form: [], adjustment: null,
    }));

  it('shows at most four previews, at most five rows each, with Full Table and View All Competitions links', async () => {
    const list = [comp(1), comp(2, { type: 'cup' }), comp(3), comp(4), comp(5), comp(6)];
    const fetchMock = fakeApi({
      '^GET /competitions$': () => json({ data: list }),
      '^GET /competitions/c1/standings$': () => json({ data: { applicable: true, rows: rows(9), season: { id: 's', name: '2026/27' } } }),
      '^GET /competitions/c3/standings$': () => json({ data: { applicable: true, rows: rows(3), season: null } }),
      '^GET /competitions/c4/standings$': () => json({ data: { applicable: true, rows: [], season: null } }),
      '^GET /competitions/c5/standings$': () => json({ data: { applicable: true, rows: rows(5), season: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderRoute('/');
    const section = (await screen.findByRole('heading', { name: 'League tables' })).closest('section');
    await waitFor(() => expect(within(section).getAllByRole('table')).toHaveLength(3));
    const cards = within(section).getAllByRole('article');
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => within(c).getByRole('heading', { level: 3 }).textContent)).toEqual(['Competition 1', 'Competition 3', 'Competition 4', 'Competition 5']);
    expect(calls(fetchMock, '/competitions/c6/standings')).toHaveLength(0);

    // 9 teams: the top five, in the server's order, and it says so.
    const first = within(cards[0]).getByRole('table');
    const bodyRows = within(first).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(5);
    expect(bodyRows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(within(bodyRows[0]).getByText('24')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Top 5 of 9 teams.')).toBeInTheDocument();
    // Fewer than five: every team, no placeholders.
    expect(within(within(cards[1]).getByRole('table')).getAllByRole('row')).toHaveLength(4);
    expect(within(cards[1]).getByText('All 3 teams.')).toBeInTheDocument();
    expect(within(cards[2]).getByText(/table will appear after the first results/i)).toBeInTheDocument();

    expect(within(cards[0]).getByRole('link', { name: /full table/i })).toHaveAttribute('href', '/competitions/comp-1?tab=table');
    expect(within(section).getByRole('link', { name: /view all competitions/i })).toHaveAttribute('href', '/competitions');
  });

  it('the full competitions page still lists every competition', async () => {
    const list = [1, 2, 3, 4, 5, 6].map((n) => comp(n));
    vi.stubGlobal('fetch', fakeApi({ '^GET /competitions$': () => json({ data: list }) }));
    renderRoute('/competitions');
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6));
  });

  it('the full table page still shows every team', async () => {
    vi.stubGlobal(
      'fetch',
      fakeApi({
        '^GET /competitions/comp-1$': () => json({ data: { ...comp(1), seasons: [], teams: [], currentSeason: null, rules: { tieBreakers: [] }, description: '', organizer: '' } }),
        '^GET /competitions/c1/standings$': () => json({ data: { applicable: true, rows: rows(9), season: null } }),
      }),
    );
    renderRoute('/competitions/comp-1?tab=table');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(10);
  });
});

const video = (id, title) => ({ id, title, source: 'youtube', youtubeId: 'dQw4w9WgXcQ', media: null, thumbnailUrl: '', category: 'Match Highlights' });
const baseMatch = {
  id: 'm1',
  status: 'completed',
  kickoffAt: '2026-10-10T15:00:00Z',
  homeTeam: { id: 'h', name: 'Saki Stars', slug: 'saki', isClubTeam: true },
  awayTeam: { id: 'a', name: 'Rivers United', slug: 'rivers' },
  competition: { id: 'c', name: 'League', slug: 'league' },
  score: { home: 2, away: 1 },
  events: [
    { id: 'e1', type: 'goal', minute: 12, addedTime: 0, side: 'home', player: { slug: 'musa' }, playerName: 'Musa Okon', assist: { slug: 'tunde' }, assistName: 'Tunde Eze' },
    { id: 'e2', type: 'own_goal', minute: 40, addedTime: 0, side: 'away', player: null, playerName: 'Rivers Defender', assist: null, assistName: '' },
    { id: 'e3', type: 'penalty_goal', minute: 88, addedTime: 0, side: 'away', player: null, playerName: 'Away Striker', assist: null, assistName: '' },
  ],
};

describe('goal and assist icons', () => {
  it('puts a soccer ball before each scorer and a boot before each assist, from the event fields only', () => {
    const { container } = render(
      <MemoryRouter>
        <MatchScorers match={baseMatch} />
      </MemoryRouter>,
    );
    const goalLines = [...container.querySelectorAll('p[title="Goal"]')];
    expect(goalLines.map((p) => p.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Goal: Musa Okon 12\'', "Goal: Rivers Defender 40' (og)", "Goal: Away Striker 88' (pen)"]);
    for (const p of goalLines) expect(p.querySelector('svg').dataset.icon).toBe('soccer-ball');
    const assists = [...container.querySelectorAll('p[title="Assist"]')];
    expect(assists).toHaveLength(1); // only the goal with an assist recorded
    expect(assists[0].querySelector('svg').dataset.icon).toBe('football-boot');
    expect(assists[0]).toHaveTextContent('Assist: Tunde Eze');
    // Names are shown exactly as stored: no icon characters in the text.
    expect(screen.getByRole('link', { name: 'Musa Okon' })).toHaveAttribute('href', '/players/musa');
    expect(screen.getByRole('link', { name: 'Tunde Eze' })).toHaveAttribute('href', '/players/tunde');
    // The own goal counts for the home side's column.
    const [home, away] = container.querySelectorAll(':scope > div > div');
    expect(home).toHaveTextContent('Rivers Defender');
    expect(away).toHaveTextContent('Away Striker');
  });
});

describe('match media actions', () => {
  const renderActions = (media) =>
    render(
      <MemoryRouter>
        <MatchMediaActions match={{ ...baseMatch, media }} />
      </MemoryRouter>,
    );

  it('shows nothing when no media has been published (and for older matches without the field)', () => {
    const { container, unmount } = renderActions({ fullMatch: null, highlights: null, photoCount: 0 });
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(renderActions(undefined).container).toBeEmptyDOMElement();
  });

  it('shows only the actions whose media exists', () => {
    const { unmount } = renderActions({ fullMatch: null, highlights: null, photoCount: 3 });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['View Pictures (3)']);
    unmount();
    renderActions({ fullMatch: video('v1', 'Full'), highlights: video('v2', 'HL'), photoCount: 0 });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Watch Full Match', 'Watch Highlights']);
  });

  it('plays the right video and opens the match photos', async () => {
    const fetchMock = fakeApi({
      '^GET /gallery$': (url) =>
        json({ data: page(url.searchParams.get('match') === 'm1' ? [{ id: 'g1', title: 'Kick-off', caption: '', category: 'Matches', image: { url: 'https://images.example.org/k.jpg', alt: 'Kick-off' } }] : []) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderActions({ fullMatch: video('v1', 'Full match video'), highlights: { ...video('v2', 'Highlights video'), youtubeId: 'aaaaaaaaaaa' }, photoCount: 1 });

    await user.click(screen.getByRole('button', { name: 'Watch Highlights' }));
    let dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(/^Highlights:/);
    expect(dialog.querySelector('iframe').src).toContain('/embed/aaaaaaaaaaa');
    expect(within(dialog).getByRole('link', { name: /watch it on youtube/i })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Watch Full Match' }));
    dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('iframe').src).toContain('/embed/dQw4w9WgXcQ');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /view pictures/i }));
    expect(await screen.findByAltText('Kick-off')).toBeInTheDocument();
    expect(calls(fetchMock, '/gallery')[0].searchParams.get('match')).toBe('m1');
  });

  it('the home page latest result shows scorers, assists and the media actions', async () => {
    vi.stubGlobal(
      'fetch',
      fakeApi({ '^GET /matches/latest-result$': () => json({ data: { ...baseMatch, media: { fullMatch: null, highlights: video('v2', 'HL'), photoCount: 0 } } }) }),
    );
    renderRoute('/');
    expect(await screen.findByRole('link', { name: 'Musa Okon' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tunde Eze' }).closest('p').querySelector('svg').dataset.icon).toBe('football-boot');
    expect(screen.getByRole('button', { name: 'Watch Highlights' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Watch Full Match' })).not.toBeInTheDocument();
  });
});
