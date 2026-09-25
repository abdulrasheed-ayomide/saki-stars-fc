import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiRequest, ApiError } from './apiClient.js';

afterEach(() => vi.unstubAllGlobals());

function respond(status, body) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

describe('apiRequest', () => {
  it('returns the data field and sends cookies', async () => {
    respond(200, { data: { status: 'ok' } });
    await expect(apiRequest('/health')).resolves.toEqual({ status: 'ok' });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/health');
    expect(options.credentials).toBe('include');
  });

  it('throws ApiError with the server message, code and request ID', async () => {
    respond(404, { error: { code: 'NOT_FOUND', message: 'Player not found.', requestId: 'abc12345' } });
    const err = await apiRequest('/players/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Player not found.', requestId: 'abc12345' });
  });

  it('gives a friendly message when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const err = await apiRequest('/health').catch((e) => e);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toMatch(/trouble connecting/);
    expect(err.message).not.toMatch(/Failed to fetch/);
  });

  it('handles a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    const err = await apiRequest('/health').catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });

  it('sends JSON bodies', async () => {
    respond(200, { data: null });
    await apiRequest('/contact', { method: 'POST', body: { name: 'Ada' } });
    const [, options] = fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe('{"name":"Ada"}');
  });

  it('works on browsers without AbortSignal.timeout / AbortSignal.any (older iPhones)', async () => {
    const { timeout, any } = AbortSignal;
    try {
      delete AbortSignal.timeout;
      delete AbortSignal.any;
      respond(200, { data: { ok: true } });
      await expect(apiRequest('/health', { signal: new AbortController().signal })).resolves.toEqual({ ok: true });
    } finally {
      AbortSignal.timeout = timeout;
      AbortSignal.any = any;
    }
  });

  it('turns a slow request into a friendly timeout message', async () => {
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const err = await apiRequest('/health', { timeoutMs: 20 }).catch((e) => e);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toBe('The request is taking longer than expected. Please try again.');
  });

  it('never shows server error text for a 500, only friendly wording', async () => {
    respond(500, { error: { code: 'INTERNAL_ERROR', message: 'MongoServerError: E11000 duplicate key', requestId: 'r1', details: { stack: 'at x (y.js:1)' } } });
    const err = await apiRequest('/matches').catch((e) => e);
    expect(err.kind).toBe('server');
    expect(err.message).not.toMatch(/Mongo|E11000|stack/);
    expect(err.message).toMatch(/Please try again/);
    expect(err.developerMessage).toMatch(/E11000/); // still available to developers
  });

  it('hides the unknown-endpoint message that would reveal API routes', async () => {
    respond(404, { error: { code: 'NOT_FOUND', message: 'No endpoint matches GET /api/v1/secret.' } });
    const err = await apiRequest('/secret').catch((e) => e);
    expect(err.message).not.toMatch(/endpoint|\/api/);
  });

  it('keeps intentional user messages from the API (401, 403, 429, validation)', async () => {
    respond(401, { error: { code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' } });
    expect((await apiRequest('/auth/login', { method: 'POST', body: {}, withAuth: false }).catch((e) => e)).message).toBe('The email or password is incorrect.');
    respond(403, { error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' } });
    expect((await apiRequest('/admin/users').catch((e) => e)).message).toBe('You do not have permission to do this.');
    respond(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } });
    expect((await apiRequest('/x').catch((e) => e)).kind).toBe('rateLimited');
  });

  it('replaces technical 401 text with a plain session message', async () => {
    respond(401, { error: { code: 'INVALID_TOKEN', message: 'JsonWebTokenError: jwt malformed' } });
    const err = await apiRequest('/auth/me').catch((e) => e);
    expect(err.message).toBe('Your session has expired. Please sign in again.');
  });

  it('wraps unexpected JavaScript errors so their text never reaches the page', async () => {
    const bug = { headers: null, json: async () => ({}) };
    Object.defineProperty(bug, 'ok', { get: () => { throw new TypeError("Cannot read properties of undefined (reading 'ok')"); } });
    vi.stubGlobal('fetch', vi.fn(async () => bug));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = await apiRequest('/health').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe('unexpected');
    expect(err.message).not.toMatch(/Cannot read|undefined/);
    expect(err.developerMessage).toMatch(/Cannot read/);
    expect(spy).toHaveBeenCalled(); // logged for developers
    spy.mockRestore();
  });
});
