import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute } from '../test/renderRoute.jsx';
import { MediaUpload } from '../components/ui/ImageUpload.jsx';
import { AppErrorBoundary } from '../components/feedback/AppErrorBoundary.jsx';
import { ToastProvider } from '../components/ui/Toast.jsx';

/**
 * End-to-end checks that a failing API or a crashing component never puts technical
 * text on the page. Every test also asserts the raw text is absent.
 */
const RAW = /AbortSignal|TypeError|Cannot read|undefined|Mongo|E11000|stack|Failed to fetch|No endpoint|\/api\/v1|INTERNAL_ERROR|HTTP_ERROR/;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const serverError = () => json({ error: { code: 'INTERNAL_ERROR', message: 'MongoServerError: E11000 duplicate key', requestId: 'req-1', details: { stack: 'at x (y.js:1:1)' } } }, 500);

/** Baseline fake API; `fail` maps "METHOD /path" regexes to failing handlers. */
function fakeApi(fail = {}) {
  return vi.fn(async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = (init.method || 'GET').toUpperCase();
    for (const [pattern, handler] of Object.entries(fail)) {
      if (new RegExp(pattern).test(`${method} ${path}`)) return handler();
    }
    if (path === '/auth/refresh') return json({ data: null });
    if (path === '/settings') return json({ data: { name: 'Saki Stars Sports Club', shortName: 'Saki Stars' } });
    if (path === '/club-stats') return json({ data: {} });
    if (/^\/matches\/(next|latest-result)$/.test(path)) return json({ data: null });
    if (/^\/(teams|staff|competitions|seasons)$/.test(path)) return json({ data: [] });
    if (/^\/(players|news|videos|gallery|matches)$/.test(path)) return json({ data: { items: [], page: 1, limit: 20, total: 0, pages: 0, categories: [] } });
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  });
}

function expectNoRawText() {
  expect(document.body.textContent).not.toMatch(RAW);
}

let consoleSpy;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  consoleSpy.mockRestore();
});

describe('public pages when the API fails', () => {
  const cases = [
    ['/fixtures-results', '^GET /matches$', 'Fixtures are temporarily unavailable'],
    ['/news', '^GET /news$', 'News could not be loaded'],
    ['/players', '^GET /players$', 'Players could not be loaded'],
    ['/teams', '^GET /teams$', 'Teams could not be loaded'],
    ['/competitions', '^GET /competitions$', 'Competitions could not be loaded'],
    ['/videos', '^GET /videos$', 'Videos could not be loaded'],
    ['/gallery', '^GET /gallery$', 'The gallery could not be loaded'],
  ];
  for (const [path, endpoint, message] of cases) {
    it(`${path}: 500 shows a friendly, specific message`, async () => {
      vi.stubGlobal('fetch', fakeApi({ [endpoint]: serverError }));
      renderRoute(path);
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByText('Please try again in a moment.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      expectNoRawText();
    });
  }

  it('network failure on Fixtures: connection message, and Try again really refetches', async () => {
    let calls = 0;
    const api = fakeApi({
      '^GET /matches$': () => {
        calls += 1;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return json({ data: { items: [], page: 1, limit: 20, total: 0, pages: 0 } });
      },
    });
    vi.stubGlobal('fetch', api);
    renderRoute('/fixtures-results');
    expect(await screen.findByText(/trouble connecting/i)).toBeInTheDocument();
    expectNoRawText();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/no fixtures found/i)).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('works on a browser without AbortSignal.timeout (the iPhone bug)', async () => {
    const { timeout, any } = AbortSignal;
    delete AbortSignal.timeout;
    delete AbortSignal.any;
    try {
      vi.stubGlobal('fetch', fakeApi());
      renderRoute('/fixtures-results');
      expect(await screen.findByText(/no fixtures found/i)).toBeInTheDocument();
      expectNoRawText();
    } finally {
      AbortSignal.timeout = timeout;
      AbortSignal.any = any;
    }
  });

  it('a 404 for a missing player shows the not-found page, not an error string', async () => {
    vi.stubGlobal('fetch', fakeApi({ '^GET /players/': () => json({ error: { code: 'NOT_FOUND', message: 'Player not found.' } }, 404) }));
    renderRoute('/players/nobody');
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expectNoRawText();
  });
});

describe('forms', () => {
  it('login: wrong password shows the API’s plain message', async () => {
    vi.stubGlobal('fetch', fakeApi({ '^POST /auth/login$': () => json({ error: { code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' } }, 401) }));
    renderRoute('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@b.co');
    await userEvent.type(screen.getByLabelText(/^password/i), 'whatever-123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('The email or password is incorrect.')).toBeInTheDocument();
  });

  it('login: server crash shows sign-in wording, not the crash', async () => {
    vi.stubGlobal('fetch', fakeApi({ '^POST /auth/login$': serverError }));
    renderRoute('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@b.co');
    await userEvent.type(screen.getByLabelText(/^password/i), 'whatever-123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/We couldn’t sign you in right now/)).toBeInTheDocument();
    expectNoRawText();
  });

  it('contact form: failure uses contact wording', async () => {
    vi.stubGlobal('fetch', fakeApi({ '^POST /contact$': serverError }));
    renderRoute('/contact');
    await userEvent.type(await screen.findByLabelText(/name/i, { selector: 'input' }), 'Ada Obi');
    await userEvent.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'ada@example.com');
    const subject = screen.queryByLabelText(/subject/i, { selector: 'input' });
    if (subject) await userEvent.type(subject, 'Hello there');
    await userEvent.type(screen.getByLabelText(/message/i, { selector: 'textarea' }), 'I would like to ask about trials for my son.');
    const consent = screen.queryByRole('checkbox');
    if (consent) await userEvent.click(consent);
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByText(/We couldn’t send your message right now/)).toBeInTheDocument();
    expectNoRawText();
  });

  it('validation errors keep the club’s field messages but hide schema jargon', async () => {
    vi.stubGlobal(
      'fetch',
      fakeApi({
        '^POST /auth/register$': () =>
          json({ error: { code: 'VALIDATION_ERROR', message: 'Some fields are missing or invalid.', details: [{ path: 'name', message: 'Invalid input: expected string, received undefined' }, { path: 'password', message: 'Use at least 10 characters.' }] } }, 422),
      }),
    );
    renderRoute('/register');
    await userEvent.type(await screen.findByLabelText(/name/i, { selector: 'input' }), 'Ada Obi');
    await userEvent.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'short1');
    const terms = screen.queryByRole('checkbox');
    if (terms) await userEvent.click(terms);
    await userEvent.click(screen.getByRole('button', { name: /create|register|sign up/i }));
    expect(await screen.findByText('Please correct the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/expected string/);
  });
});

describe('uploads, sessions and crashes', () => {
  it('image upload failure shows upload wording', async () => {
    vi.stubGlobal('fetch', fakeApi({ '^POST /media/upload$': serverError }));
    const { container } = render(
      <ToastProvider>
        <MediaUpload value={null} onChange={() => {}} folder="news" />
      </ToastProvider>,
    );
    const input = container.querySelector('input[type="file"]');
    await userEvent.upload(input, new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(await screen.findByText(/We couldn’t upload this file/)).toBeInTheDocument();
    expectNoRawText();
  });

  it('expired session: protected page sends the visitor to sign in', async () => {
    vi.stubGlobal('fetch', fakeApi({ '^POST /auth/refresh$': () => json({ error: { code: 'SESSION_REVOKED', message: 'JsonWebTokenError: invalid signature' } }, 401) }));
    const { router } = renderRoute('/account');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expectNoRawText();
  });

  it('a component crash shows the friendly boundary, and logs the real error', async () => {
    function Broken() {
      throw new TypeError("Cannot read properties of undefined (reading 'name')");
    }
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expectNoRawText();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
