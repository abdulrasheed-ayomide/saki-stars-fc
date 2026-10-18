import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute } from '../test/renderRoute.jsx';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function staffUser(permissions, role = 'director') {
  return {
    id: 'u1', email: 's@x.test', name: 'Sam', role: 'staff', status: 'active', emailVerified: true,
    staff: { id: 's1', role, roleLabel: role, status: 'active', assignedTeams: [], assignedPlayers: [] },
    permissions: ['dashboard.view', ...permissions].map((p) => ({ permission: p, scope: 'all' })),
  };
}

/** Records every request; `routes` maps "METHOD /path" regexes to handlers. */
function api(user, routes) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path, url, body });
    for (const [pattern, handler] of Object.entries(routes)) if (new RegExp(pattern).test(`${method} ${path}`)) return handler({ url, body });
    if (path === '/auth/refresh') return json({ data: { accessToken: 't', user } });
    if (path === '/settings') return json({ data: { name: 'Saki Stars Sports Club', shortName: 'Saki Stars' } });
    if (path === '/admin/teams') return json({ data: { items: [], page: 1, pages: 1, total: 0 } });
    return json({ data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('dashboard: player squad', () => {
  it('requires a squad for a new player and sends the chosen squad', async () => {
    const calls = api(staffUser(['players.view', 'players.create', 'players.edit']), {
      '^POST /admin/players$': ({ body }) => json({ data: { id: 'p9', ...body } }, 201),
    });
    const user = userEvent.setup();
    renderRoute('/dashboard/players/new');
    const squad = await screen.findByRole('combobox', { name: /squad/i });
    expect(within(squad).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a squad…', 'Saki Stars FC Senior', 'Saki Stars FC Under-19']);
    await user.type(screen.getByRole('textbox', { name: /first name/i }), 'Ayo');
    await user.type(screen.getByRole('textbox', { name: /last name/i }), 'Young');
    await user.click(screen.getByRole('button', { name: /^(save|create)/i }));
    expect(await screen.findByText(/choose the player’s squad/i)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/admin/players')).toBe(false);

    await user.selectOptions(squad, 'under19');
    await user.click(screen.getByRole('button', { name: /^(save|create)/i }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/admin/players')?.body.squad).toBe('under19'));
  });

  it('flags players without a squad and lets staff filter them', async () => {
    const calls = api(staffUser(['players.view', 'players.edit']), {
      '^GET /admin/players$': ({ url }) =>
        json({
          data: {
            items: [{ id: 'p1', fullName: 'Old Timer', position: 'Defender', status: 'active', squad: null, team: null, showOnWebsite: true }],
            page: 1, pages: 1, total: 1, limit: 50,
            unassignedSquadCount: url.searchParams.get('squad') === 'unassigned' ? 1 : 1,
          },
        }),
    });
    const user = userEvent.setup();
    renderRoute('/dashboard/players');
    expect(await screen.findByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText(/1 player has no squad yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show them/i }));
    await waitFor(() => expect(calls.some((c) => c.path === '/admin/players' && c.url.searchParams.get('squad') === 'unassigned')).toBe(true));
  });
});

describe('dashboard: match media tab', () => {
  const match = {
    id: 'm1', status: 'completed', homeTeam: { name: 'Saki Stars' }, awayTeam: { name: 'Rivers United' },
    competition: { name: 'League' }, season: { name: '2026/27' }, score: { home: 1, away: 0 }, countsForStandings: true,
    events: [], lineups: { home: [], away: [] }, stats: {}, report: { title: '', body: '', publishedAt: null }, updatedAt: 'x',
  };

  it('media staff see only the Media tab and can add a full match video by YouTube link', async () => {
    let media = { fullMatch: null, highlights: null, photos: [], canUseLibrary: true };
    const calls = api(staffUser(['media.manage'], 'media_officer'), {
      '^GET /admin/matches/m1$': () => json({ data: match }),
      '^GET /admin/matches/m1/media$': () => json({ data: media }),
      '^PUT /admin/matches/m1/media/full-match$': ({ body }) => {
        media = { ...media, fullMatch: { id: 'v1', title: 'Saki Stars v Rivers United: Full match', source: 'youtube', youtubeId: 'dQw4w9WgXcQ', status: 'published', thumbnailUrl: '' } };
        return json({ data: { ...media, body } });
      },
      '^GET /admin/videos$': () => json({ data: { items: [], page: 1, pages: 1, total: 0 } }),
    });
    const user = userEvent.setup();
    renderRoute('/dashboard/matches/m1');
    expect(await screen.findByRole('tab', { name: 'Media' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /result/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /match report/i })).not.toBeInTheDocument();

    const fullCard = (await screen.findByRole('heading', { name: 'Full match video' })).closest('.rounded-lg');
    await user.type(within(fullCard).getByRole('textbox', { name: /youtube link/i }), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(within(fullCard).getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ source: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }));
    expect(await screen.findByText('Saki Stars v Rivers United: Full match')).toBeInTheDocument();
    expect(screen.getByText('On the website')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Match highlights' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Match pictures' })).toBeInTheDocument();
  });

  it('staff without media or match permissions cannot open the match editor', async () => {
    api(staffUser(['players.view'], 'scout'), {});
    renderRoute('/dashboard/matches/m1');
    expect(await screen.findByText(/no access to this section/i)).toBeInTheDocument();
  });
});
