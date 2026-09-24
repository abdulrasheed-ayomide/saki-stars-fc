import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute } from '../test/renderRoute.jsx';
import { mainNavigation, legalNavigation } from '../config/navigation.js';

/**
 * A small fake API: every list endpoint is empty, nobody is signed in, and a few
 * endpoints return the specific shapes the pages expect. Tests can override routes.
 */
function fakeApi(overrides = {}) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  return vi.fn(async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = (init.method || 'GET').toUpperCase();
    for (const [pattern, handler] of Object.entries(overrides)) {
      if (new RegExp(pattern).test(`${method} ${path}`)) return handler({ url, init, json });
    }
    if (path === '/health') return json({ data: { status: 'ok' } });
    if (path === '/auth/refresh') return json({ data: null });
    if (path === '/settings') return json({ data: { name: 'Saki Stars Sports Club', shortName: 'Saki Stars' } });
    if (path === '/club-stats') return json({ data: {} });
    if (/^\/matches\/(next|latest-result)$/.test(path)) return json({ data: null });
    if (/^\/legal\//.test(path)) return json({ data: { title: 'Privacy Policy', body: 'We only collect what we need.', version: '1.0', effectiveDate: '2026-01-01' } });
    if (path === '/contact' && method === 'POST') return json({ data: { received: true } }, 201);
    if (/^\/(teams|staff|competitions|seasons)$/.test(path)) return json({ data: [] });
    if (/^\/(players|news|videos|gallery|matches)$/.test(path)) {
      return json({ data: { items: [], page: 1, limit: 20, total: 0, pages: 0, categories: [] } });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fakeApi());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('public routes', () => {
  it('renders the homepage hero from club settings with both calls to action', async () => {
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1, name: /saki stars sports club/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view fixtures/i })).toHaveAttribute('href', '/fixtures-results');
    expect(screen.getByRole('link', { name: /meet the team/i })).toHaveAttribute('href', '/teams');
  });

  it('uses the headline saved in settings when there is one', async () => {
    vi.stubGlobal(
      'fetch',
      fakeApi({ '^GET /settings$': ({ json }) => json({ data: { name: 'Saki Stars Sports Club', heroHeadline: 'Pride of Saki' } }) }),
    );
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Pride of Saki' })).toBeInTheDocument();
  });

  it('shows honest empty states instead of invented content', async () => {
    renderRoute('/news');
    expect(await screen.findByRole('heading', { level: 1, name: /news/i })).toBeInTheDocument();
    expect(await screen.findByText(/no (news|articles)/i)).toBeInTheDocument();
    await waitFor(() => expect(document.title).toMatch(/^News \| /));
  });

  it('shows a 404 page for unknown URLs', async () => {
    renderRoute('/this/does/not/exist');
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });

  it('has a working page (not a 404) for every navigation and legal link', async () => {
    for (const item of [...mainNavigation, ...legalNavigation]) {
      const { unmount } = renderRoute(item.to);
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /page not found/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/not available yet/i)).not.toBeInTheDocument();
      unmount();
    }
  });

  it('shows the sign-in, registration and password reset pages', async () => {
    for (const [path, heading] of [
      ['/login', /sign in/i],
      ['/register', /create (an |your )?account/i],
      ['/forgot-password', /reset|forgot/i],
    ]) {
      const { unmount } = renderRoute(path);
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      unmount();
    }
  });
});

describe('access control in the browser', () => {
  it.each(['/dashboard', '/portal', '/account'])('sends signed-out visitors from %s to sign in', async (path) => {
    const { router } = renderRoute(path);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toContain(encodeURIComponent(path));
  });
});

describe('mobile menu', () => {
  it('opens as a dialog, locks page scroll, and closes with Escape returning focus', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    const openButton = await screen.findByRole('button', { name: /open menu/i });

    await user.click(openButton);
    const dialog = screen.getByRole('dialog', { name: /main menu/i });
    expect(openButton).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(within(dialog).getAllByRole('link').length).toBeGreaterThanOrEqual(mainNavigation.length);
    expect(dialog).toContainElement(document.activeElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => expect(openButton).toHaveFocus());
  });

  it('keeps keyboard focus inside the menu', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await user.click(await screen.findByRole('button', { name: /open menu/i }));
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < mainNavigation.length + 5; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement);
    }
  });

  it('closes after choosing a link and navigates', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/');
    await user.click(await screen.findByRole('button', { name: /open menu/i }));
    await user.click(within(screen.getByRole('dialog')).getAllByRole('link', { name: 'Contact' })[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/contact');
  });
});

describe('server status notice', () => {
  it('tells the user when the server cannot be reached', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    renderRoute('/');
    expect(await screen.findByText(/connecting to the club server/i)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(95_000);
    expect(await screen.findByText(/not responding/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
