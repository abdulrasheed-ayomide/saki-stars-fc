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

function api(user, routes = {}) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init = {}) => {
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
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const row = (id, extra = {}) => ({
  id, reference: `TR-2026-000${id}`, direction: 'outgoing', player: { id: 'p1', name: 'Musa Okon' }, playerName: 'Musa Okon',
  fromClub: 'Saki Stars Sports Club', toClub: 'Rivers United', type: 'loan', season: null, window: '', proposedDate: '2026-11-01T00:00:00Z',
  effectiveDate: null, status: 'draft', createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z', ...extra,
});

const detail = (extra = {}) => ({
  ...row('1'),
  externalPlayer: { firstName: '', lastName: '', position: '', nationality: '', dateOfBirth: null },
  player: { id: 'p1', name: 'Musa Okon', position: 'Forward', status: 'active' },
  clubTeam: null, loanEndDate: null, reason: 'Game time', internalNotes: 'Private note', documents: [], submittedAt: null, approval: null,
  completedAt: null, cancelledAt: null, announcement: null,
  history: [{ id: 'h1', at: '2026-10-20T10:00:00Z', by: { id: 'u2', name: 'Tess' }, action: 'created', fromStatus: '', toStatus: 'draft', note: '', changes: null }],
  createdBy: { id: 'u2', name: 'Tess' }, updatedBy: null, allowedActions: [], canEdit: false, canManageDocuments: false, canDraftAnnouncement: false,
  playerUpdatePreview: null, canUpdatePlayer: false,
  ...extra,
});

describe('Player transfers dashboard', () => {
  it('lists transfers with a summary and sends filters to the server', async () => {
    const calls = api(staffUser(['transfers.view']), {
      '^GET /admin/transfers/summary$': () => json({ data: { incoming: 3, outgoing: 2, pending: 1, approved: 1, completed: 2, total: 5, byStatus: {} } }),
      '^GET /admin/transfers$': () => json({ data: { items: [row('1'), row('2', { direction: 'incoming', playerName: 'Kola New', player: null, fromClub: 'Kwara United', toClub: 'Saki Stars Sports Club', status: 'pending_approval' })], page: 1, pages: 1, total: 2, limit: 20 } }),
      '^GET /seasons$': () => json({ data: [] }),
    });
    const user = userEvent.setup();
    renderRoute('/dashboard/transfers');
    expect(await screen.findByRole('heading', { name: 'Player transfers', level: 1 })).toBeInTheDocument();
    const summary = await screen.findByLabelText('Transfer summary');
    expect(within(summary).getByText('Pending approval').nextSibling).toHaveTextContent('1');
    expect(await screen.findByText('Kola New')).toBeInTheDocument();
    expect(screen.getByText('Pending approval', { selector: 'span' })).toBeInTheDocument();
    // View-only staff do not get the create button.
    expect(screen.queryByRole('link', { name: /new transfer/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), 'incoming');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'pending_approval');
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/admin/transfers' && c.url.searchParams.get('direction') === 'incoming' && c.url.searchParams.get('status') === 'pending_approval')).toBe(true),
    );
  });

  it('creates an incoming transfer for a player who is not registered yet', async () => {
    const calls = api(staffUser(['transfers.view', 'transfers.manage']), {
      '^GET /admin/transfers/player-options$': () => json({ data: [{ id: 'p1', name: 'Musa Okon', status: 'active', team: 'First Team' }] }),
      '^POST /admin/transfers$': ({ body }) => json({ data: detail({ id: '9', reference: 'TR-2026-0009', direction: body.direction }) }, 201),
      '^GET /admin/transfers/9$': () => json({ data: detail({ id: '9', reference: 'TR-2026-0009' }) }),
      '^GET /seasons$': () => json({ data: [] }),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/dashboard/transfers/new');
    await user.selectOptions(await screen.findByRole('combobox', { name: /who is joining/i }), 'new');
    await user.type(screen.getByRole('textbox', { name: /first name/i }), 'Kola');
    await user.type(screen.getByRole('textbox', { name: /last name/i }), 'New');
    await user.type(screen.getByRole('textbox', { name: /joining from/i }), 'Kwara United');
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard/transfers/9'));
    const post = calls.find((c) => c.method === 'POST' && c.path === '/admin/transfers');
    expect(post.body).toMatchObject({ direction: 'incoming', player: null, externalPlayer: { firstName: 'Kola', lastName: 'New' }, otherClub: 'Kwara United', type: 'permanent' });
    expect(post.body.status).toBeUndefined();
  });

  it('shows server validation errors on the form', async () => {
    api(staffUser(['transfers.view', 'transfers.manage']), {
      '^GET /admin/transfers/player-options$': () => json({ data: [] }),
      '^POST /admin/transfers$': () => json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: [{ path: 'player', message: 'Choose the club player who is leaving.' }] } }, 422),
      '^GET /seasons$': () => json({ data: [] }),
    });
    const user = userEvent.setup();
    renderRoute('/dashboard/transfers/new');
    await user.selectOptions(await screen.findByRole('combobox', { name: /direction/i }), 'outgoing');
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    expect(await screen.findByText('Choose the club player who is leaving.')).toBeInTheDocument();
    expect(screen.getByText(/correct the highlighted fields/i)).toBeInTheDocument();
  });

  it('only offers the actions the server allows, and rejection needs a reason', async () => {
    const calls = api(staffUser(['transfers.view', 'transfers.approve']), {
      '^GET /admin/transfers/1$': () => json({ data: detail({ status: 'pending_approval', submittedAt: '2026-10-21T09:00:00Z', allowedActions: ['approve', 'reject'] }) }),
      '^POST /admin/transfers/1/actions/reject$': ({ body }) =>
        json({ data: detail({ status: 'rejected', approval: { decision: 'rejected', by: { name: 'Sam' }, at: '2026-10-22T09:00:00Z', note: body.note } }) }),
    });
    const user = userEvent.setup();
    renderRoute('/dashboard/transfers/1');
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark completed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByText('Private note')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await within(dialog).findByText('Give a reason.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path.includes('/actions/'))).toBe(false);
    await user.type(within(dialog).getByRole('textbox', { name: /reason/i }), 'Medical not passed');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path.includes('/actions/'))?.body).toMatchObject({ note: 'Medical not passed' }));
    expect(await screen.findByText('Medical not passed')).toBeInTheDocument();
    expect(screen.getAllByText('Rejected', { selector: 'span' }).length).toBeGreaterThanOrEqual(2); // status and decision
  });

  it('completing offers the optional player-record update with a preview', async () => {
    const calls = api(staffUser(['transfers.view', 'transfers.approve', 'players.edit']), {
      '^GET /admin/transfers/1$': () =>
        json({ data: detail({ status: 'in_progress', allowedActions: ['complete', 'cancel'], canUpdatePlayer: true, playerUpdatePreview: { status: { from: 'active', to: 'on_loan' } } }) }),
      '^POST /admin/transfers/1/actions/complete$': () => json({ data: detail({ status: 'completed' }) }),
    });
    const user = userEvent.setup();
    renderRoute('/dashboard/transfers/1');
    await user.click(await screen.findByRole('button', { name: /mark completed/i }));
    const dialog = screen.getByRole('dialog');
    const box = within(dialog).getByRole('checkbox', { name: /also update the player/i });
    expect(box).not.toBeChecked();
    expect(within(dialog).getByText(/Status: Active → On loan/)).toBeInTheDocument();
    await user.click(box);
    await user.click(within(dialog).getByRole('button', { name: /mark completed/i }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path.includes('/actions/'))?.body).toMatchObject({ updatePlayer: true }));
  });

  it('staff without transfer permissions cannot open the page', async () => {
    api(staffUser(['players.view'], 'scout'));
    renderRoute('/dashboard/transfers');
    expect(await screen.findByText(/no access to this section/i)).toBeInTheDocument();
  });
});
