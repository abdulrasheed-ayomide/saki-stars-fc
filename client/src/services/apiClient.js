import { site } from '../config/site.js';

export class ApiError extends Error {
  constructor({ status, code, message, requestId, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

// ---- Session state ------------------------------------------------------------------
// The short-lived access token lives only in memory (never localStorage). The long-lived
// refresh token is an HttpOnly cookie the browser sends to /api/v1/auth/refresh.
let accessToken = null;
let refreshInFlight = null;
let serverOffsetMs = 0;
const listeners = new Set();

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

/** Subscribe to session changes: called with the user object (or null when signed out). */
export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitSession(user) {
  for (const fn of listeners) fn(user);
}

/** Current time corrected for a wrong device clock, using the server's Date header. */
export function serverNow() {
  return Date.now() + serverOffsetMs;
}

function recordServerTime(response) {
  const header = response.headers?.get?.('Date');
  const t = header ? Date.parse(header) : NaN;
  if (!Number.isNaN(t)) serverOffsetMs = t - Date.now();
}

function networkError(timedOut) {
  return new ApiError({
    status: 0,
    code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
    message: timedOut ? 'The server took too long to respond. Please try again.' : 'Could not reach the server. Check your internet connection and try again.',
  });
}

async function rawFetch(path, { method = 'GET', body, formData, signal, timeoutMs = 15_000, withAuth = true, headers = {} }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (withAuth && accessToken) h.Authorization = `Bearer ${accessToken}`;
  try {
    const response = await fetch(`${site.apiBaseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: h,
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal: combined,
    });
    recordServerTime(response);
    return response;
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled; let it propagate unchanged
    throw networkError(timeout.aborted);
  }
}

async function toResult(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError({
      status: response.status,
      code: error.code || 'HTTP_ERROR',
      message: error.message || 'Something went wrong. Please try again.',
      requestId: error.requestId,
      details: error.details,
    });
  }
  return payload?.data;
}

/**
 * Exchanges the refresh cookie for a new access token. Only one refresh runs at a time,
 * however many requests need it. Resolves to the user, or null when not signed in.
 */
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await rawFetch('/auth/refresh', { method: 'POST', withAuth: false, headers: { 'X-Requested-With': 'fetch' } });
          const data = await toResult(response);
          if (!data) {
            accessToken = null;
            emitSession(null);
            return null;
          }
          accessToken = data.accessToken;
          emitSession(data.user);
          return data.user;
        } catch (err) {
          // Another tab refreshed at the same moment: wait briefly and use the new cookie.
          if (err.code === 'REFRESH_RACE' && attempt === 0) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          if (err.status === 0) throw err; // offline: keep the current state
          accessToken = null;
          emitSession(null);
          return null;
        }
      }
      return null;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const EXPIRED = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN']);
const ENDED = new Set(['SESSION_REVOKED', 'ACCOUNT_INACTIVE']);

/**
 * Single entry point for API calls. Returns the `data` field of a successful response
 * and throws ApiError with a user-safe message otherwise. An expired access token is
 * refreshed once, silently, and the request is retried.
 */
export async function apiRequest(path, options = {}) {
  let response = await rawFetch(path, options);
  if (response.status === 401 && accessToken && options.withAuth !== false) {
    const payload = await response.clone().json().catch(() => null);
    const code = payload?.error?.code;
    if (EXPIRED.has(code)) {
      const user = await refreshSession();
      if (user) response = await rawFetch(path, options);
    } else if (ENDED.has(code)) {
      accessToken = null;
      emitSession(null);
    }
  }
  return toResult(response);
}

/** Uploads one file (multipart) to an API endpoint. */
export function uploadFile(path, file, fields = {}, options = {}) {
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.append(k, v);
  formData.append('file', file);
  return apiRequest(path, { method: 'POST', formData, timeoutMs: 180_000, ...options });
}

/** Signs in and stores the access token. */
export async function signIn(email, password) {
  const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password }, withAuth: false });
  accessToken = data.accessToken;
  emitSession(data.user);
  return data.user;
}

export async function signOut() {
  try {
    await rawFetch('/auth/logout', { method: 'POST', withAuth: false, headers: { 'X-Requested-With': 'fetch' } });
  } finally {
    accessToken = null;
    emitSession(null);
  }
}

/** Downloads an authenticated file (e.g. CSV export) and saves it. */
export async function downloadFile(path, filename) {
  let response = await rawFetch(path, {});
  if (response.status === 401 && accessToken) {
    await refreshSession();
    response = await rawFetch(path, {});
  }
  if (!response.ok) await toResult(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
