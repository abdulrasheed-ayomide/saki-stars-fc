import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute } from '../test/renderRoute.jsx';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const player = {
  id: 'p1',
  slug: 'ade-test',
  name: 'Ade Test',
  firstName: 'Ade',
  lastName: 'Test',
  position: 'Forward',
  detailedPosition: '',
  jerseyNumber: 9,
  team: null,
  nationality: 'Nigerian',
  bio: '',
  preferredFoot: '',
  photo: null,
  stats: { career: { appearances: 0, goals: 0, assists: 0 }, season: null },
  recentMatches: [],
};

function fakeApi(profile) {
  return vi.fn(async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/auth/refresh') return json({ data: null });
    if (path === '/settings') return json({ data: { name: 'Saki Stars Sports Club', shortName: 'Saki Stars' } });
    if (path === '/players/ade-test') return json({ data: profile });
    return json({ data: [] });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('public player profile media', () => {
  it('shows Photos and Videos only when there is media; YouTube loads only on tap', async () => {
    vi.stubGlobal(
      'fetch',
      fakeApi({
        ...player,
        media: {
          photos: [{ id: 'g1', title: 'Goal celebration', caption: '', category: 'Matches', image: { source: 'link', url: 'https://images.example.org/goal.jpg', alt: 'Ade celebrates' } }],
          videos: [{ id: 'v1', title: 'Ade scores twice', category: 'Goals', source: 'youtube', youtubeId: 'dQw4w9WgXcQ' }],
        },
      }),
    );
    const { container } = renderRoute('/players/ade-test');
    expect(await screen.findByRole('heading', { name: 'Photos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Videos' })).toBeInTheDocument();
    expect(screen.getByAltText('Ade celebrates')).toHaveAttribute('src', 'https://images.example.org/goal.jpg');
    expect(container.querySelector('iframe')).toBeNull(); // no YouTube code until tapped
    fireEvent.click(screen.getByRole('button', { name: /play video: ade scores twice/i }));
    expect(container.querySelector('iframe')).toBeTruthy();
    // A linked photo that disappears shows a neutral placeholder, not a broken image.
    fireEvent.error(screen.getByAltText('Ade celebrates'));
    expect(screen.getByRole('img', { name: 'Image unavailable' })).toBeInTheDocument();
  });

  it('hides both sections when the player has no published media', async () => {
    vi.stubGlobal('fetch', fakeApi({ ...player, media: { photos: [], videos: [] } }));
    renderRoute('/players/ade-test');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ade Test' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Photos' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Videos' })).toBeNull();
  });
});

describe('team form: Saki Stars team or opponent', () => {
  it('requires an explicit choice for a new team', async () => {
    const director = {
      id: 'u1', email: 'd@x.test', name: 'Dana', role: 'staff', status: 'active', emailVerified: true,
      staff: { id: 's1', role: 'director', roleLabel: 'Club Director', status: 'active', assignedTeams: [], assignedPlayers: [] },
      permissions: ['dashboard.view', 'teams.manage', 'competitions.manage'].map((p) => ({ permission: p, scope: 'all' })),
    };
    const posts = [];
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
      const path = url.pathname.replace(/^\/api\/v1/, '');
      if (path === '/auth/refresh') return json({ data: { accessToken: 't', user: director } });
      if (path === '/settings') return json({ data: { name: 'Saki Stars Sports Club', shortName: 'Saki Stars' } });
      if (path === '/admin/teams' && init.method === 'POST') {
        posts.push(JSON.parse(init.body));
        return json({ data: { id: 't1' } }, 201);
      }
      if (path === '/admin/teams') return json({ data: { items: [], page: 1, pages: 1, total: 0 } });
      return json({ data: [] });
    }));
    renderRoute('/dashboard/teams');
    await userEvent.click(await screen.findByRole('button', { name: /add team/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Remo Stars');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(await within(dialog).findByText('Choose whether this is a Saki Stars team or an opponent.')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('radio', { name: /opponent/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(posts).toHaveLength(1);
    expect(posts[0].isClubTeam).toBe(false);
  });
});

describe('admin player page: attach an existing photo or video', () => {
  it('searches the existing library and tags the player without creating media', async () => {
    const staffUser = {
      id: 'u2', email: 'm@x.test', name: 'Mo', role: 'staff', status: 'active', emailVerified: true,
      staff: { id: 's2', role: 'director', roleLabel: 'Club Director', status: 'active', assignedTeams: [], assignedPlayers: [] },
      permissions: ['dashboard.view', 'players.view', 'players.edit', 'media.manage'].map((p) => ({ permission: p, scope: 'all' })),
    };
    const staffPlayer = { ...player, fullName: 'Ade Test', status: 'active', showOnWebsite: true, canEdit: true, team: null };
    const calls = [];
    const library = [
      { id: 'g1', title: 'Derby day crowd', caption: '', category: 'Matches', status: 'published', image: { source: 'link', url: 'https://images.example.org/derby.jpg' }, players: [] },
      { id: 'g2', title: 'Old team photo', caption: '', category: 'Matches', status: 'hidden', image: { source: 'link', url: 'https://images.example.org/old.jpg' }, players: [{ id: 'p1', name: 'Ade Test' }] },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
      const path = url.pathname.replace(/^\/api\/v1/, '');
      calls.push(`${init.method || 'GET'} ${path}${url.search}`);
      if (path === '/auth/refresh') return json({ data: { accessToken: 't', user: staffUser } });
      if (path === '/settings') return json({ data: { name: 'Saki Stars Sports Club', shortName: 'Saki Stars' } });
      if (path === '/admin/players/p1') return json({ data: staffPlayer });
      if (path === '/admin/players/p1/media') return json({ data: { photos: [], videos: [], canManage: true, photosHiddenPublicly: false } });
      if (path === '/admin/gallery') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const items = library.filter((g) => g.title.toLowerCase().includes(q));
        return json({ data: { items, page: 1, pages: 1, total: items.length, limit: 12 } });
      }
      if (path === '/admin/players/p1/media/photo/g1' && init.method === 'POST') return json({ data: { id: 'g1', alreadyTagged: false } });
      if (path === '/admin/teams') return json({ data: { items: [], page: 1, pages: 1, total: 0 } });
      return json({ data: [] });
    }));
    renderRoute('/dashboard/players/p1');
    await userEvent.click(await screen.findByRole('button', { name: /attach existing photo/i }));
    const dialog = await screen.findByRole('dialog', { name: /attach an existing photo/i });
    // Already-tagged items are marked; others can be attached.
    expect(await within(dialog).findByText('Derby day crowd')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /attached/i })).toBeDisabled();
    // Search uses the server (one page at a time), not a full library download.
    await userEvent.type(within(dialog).getByRole('searchbox'), 'derby');
    await within(dialog).findByText('Derby day crowd');
    await vi.waitFor(() => expect(calls.some((c) => c.startsWith('GET /admin/gallery') && c.includes('q=derby') && c.includes('limit=12'))).toBe(true));
    await userEvent.click(within(dialog).getByRole('button', { name: /^attach$/i }));
    await vi.waitFor(() => expect(calls).toContain('POST /admin/players/p1/media/photo/g1'));
    expect(await within(dialog).findByRole('button', { name: /attached/i })).toBeDisabled();
    // Only the tag request was sent: no gallery item was created.
    expect(calls.some((c) => c.startsWith('POST /admin/gallery'))).toBe(false);
  });
});
