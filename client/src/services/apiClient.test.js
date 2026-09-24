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
    expect(err.message).toMatch(/internet connection/);
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
});
