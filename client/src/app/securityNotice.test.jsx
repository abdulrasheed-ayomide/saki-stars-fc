import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute } from '../test/renderRoute.jsx';
import { resetSecurityNotice } from '../components/feedback/SecurityNotice.jsx';
import { isSecurityNoticeEnabled } from '../config/securityNotice.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ROLES = ['director', 'chairman', 'consultant', 'team_manager', 'it_manager', 'media_officer', 'scout'];

function staffUser(role, id = `u-${role}`) {
  return {
    id, email: `${role}@x.test`, name: `Sam ${role}`, role: 'staff', status: 'active', emailVerified: true,
    staff: { id: `s-${role}`, role, roleLabel: role, status: 'active', assignedTeams: [], assignedPlayers: [] },
    // Every staff role's default permissions include dashboard.view.
    permissions: [{ permission: 'dashboard.view', scope: 'all' }],
  };
}

function fakeApi(user) {
  return vi.fn(async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/auth/refresh') return json({ data: user ? { accessToken: 't', user } : null });
    if (path === '/auth/logout') return json({ data: { ok: true } });
    if (path === '/settings') return json({ data: { name: 'Saki Stars Sports Club', shortName: 'Saki Stars' } });
    if (/^\/matches\/(next|latest-result)$/.test(path)) return json({ data: null });
    if (path === '/admin/dashboard/overview') return json({ data: { counts: {}, attention: {}, recent: [] } });
    if (/^\/(players|news|videos|gallery|matches|notifications)$/.test(path)) return json({ data: { items: [], page: 1, pages: 0, total: 0 } });
    return json({ data: [] });
  });
}

const notice = () => screen.queryByRole('dialog', { name: /warning/i });

beforeEach(() => {
  resetSecurityNotice();
  vi.stubEnv('VITE_SECURITY_NOTICE_ENABLED', 'true');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('dashboard security notice', () => {
  it.each(ROLES)('is shown to the %s role in the staff dashboard', async (role) => {
    vi.stubGlobal('fetch', fakeApi(staffUser(role)));
    renderRoute('/dashboard/notifications');
    const dialog = await screen.findByRole('dialog', { name: /warning/i });
    expect(within(dialog).getByRole('heading', { name: /warning/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/Security Reminder: Please ensure the website's authentication, access controls, and security monitoring are properly configured/);
    expect(within(dialog).getByRole('button', { name: 'OK' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Keyboard users land on the dialog's main button.
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'OK' })).toHaveFocus());
    // No claims of detected attacks, no counters.
    expect(dialog.textContent).not.toMatch(/attack|hack|\d+ (attempts|threats)/i);
  });

  it('never appears on public pages, for visitors or for signed-in staff', async () => {
    vi.stubGlobal('fetch', fakeApi(null));
    const visitor = renderRoute('/');
    await screen.findByRole('heading', { level: 1 });
    expect(notice()).toBeNull();
    visitor.unmount();

    vi.stubGlobal('fetch', fakeApi(staffUser('director')));
    renderRoute('/players');
    await screen.findByRole('heading', { level: 1, name: 'Players' });
    await new Promise((r) => setTimeout(r, 50));
    expect(notice()).toBeNull();
  });

  it('is not shown to ordinary signed-in users (they cannot open the dashboard)', async () => {
    vi.stubGlobal('fetch', fakeApi({ id: 'fan', email: 'f@x.test', name: 'Fan', role: 'user', status: 'active', emailVerified: true, permissions: [] }));
    renderRoute('/dashboard/notifications');
    expect(await screen.findByText(/this area is for club staff/i)).toBeInTheDocument();
    expect(notice()).toBeNull();
  });

  it('OK and Cancel both dismiss it; it comes back after two minutes, once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', fakeApi(staffUser('media_officer')));
    renderRoute('/dashboard/notifications');

    await user.click(within(await screen.findByRole('dialog', { name: /warning/i })).getByRole('button', { name: 'OK' }));
    expect(notice()).toBeNull();
    act(() => vi.advanceTimersByTime(119_000));
    expect(notice()).toBeNull();
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getAllByRole('dialog', { name: /warning/i })).toHaveLength(1);

    await user.click(within(notice()).getByRole('button', { name: 'Cancel' }));
    expect(notice()).toBeNull();
    act(() => vi.advanceTimersByTime(121_000));
    expect(screen.getAllByRole('dialog', { name: /warning/i })).toHaveLength(1);

    // Escape dismisses too (standard dialog behaviour).
    await user.keyboard('{Escape}');
    expect(notice()).toBeNull();
  });

  it('moving between dashboard pages neither duplicates it nor shows it early', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', fakeApi(staffUser('team_manager')));
    const { router } = renderRoute('/dashboard/notifications');
    await user.click(within(await screen.findByRole('dialog', { name: /warning/i })).getByRole('button', { name: 'OK' }));
    for (const path of ['/dashboard/search', '/dashboard/notifications', '/', '/dashboard/notifications']) {
      await act(() => router.navigate(path));
      act(() => vi.advanceTimersByTime(10_000));
      expect(notice(), path).toBeNull();
    }
    act(() => vi.advanceTimersByTime(90_000)); // two minutes after dismissal in total
    await waitFor(() => expect(screen.getAllByRole('dialog', { name: /warning/i })).toHaveLength(1));
  });

  it('waits while another dialog is open instead of stacking on top of it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', fakeApi(staffUser('scout')));
    renderRoute('/dashboard/notifications');
    await user.click(within(await screen.findByRole('dialog', { name: /warning/i })).getByRole('button', { name: 'OK' }));
    await user.click(screen.getByRole('button', { name: /open dashboard menu/i }));
    expect(screen.getByRole('dialog', { name: /dashboard menu/i })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(125_000));
    expect(notice()).toBeNull();
    await user.keyboard('{Escape}'); // closes the menu
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(notice()).not.toBeNull();
  });

  it('signing out removes it and leaves no timer behind', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', fakeApi(staffUser('it_manager')));
    const { router } = renderRoute('/dashboard/notifications');
    await user.click(within(await screen.findByRole('dialog', { name: /warning/i })).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }).closest('button') || screen.getByRole('menuitem', { name: /sign out/i }));
    await waitFor(() => expect(router.state.location.pathname).not.toMatch(/^\/dashboard/));
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(notice()).toBeNull();
  });

  it('can be switched off with VITE_SECURITY_NOTICE_ENABLED=false', async () => {
    expect(isSecurityNoticeEnabled('false')).toBe(false);
    expect(isSecurityNoticeEnabled('0')).toBe(false);
    expect(isSecurityNoticeEnabled(undefined)).toBe(true);
    expect(isSecurityNoticeEnabled('true')).toBe(true);
    vi.stubEnv('VITE_SECURITY_NOTICE_ENABLED', 'false');
    vi.stubGlobal('fetch', fakeApi(staffUser('director')));
    renderRoute('/dashboard/notifications');
    await screen.findByRole('button', { name: /open dashboard menu/i });
    await new Promise((r) => setTimeout(r, 50));
    expect(notice()).toBeNull();
  });
});
