import { AppError } from '../utils/AppError.js';

/**
 * CSRF protection for the endpoints that rely on the refresh cookie (refresh, logout).
 * 1. The browser must send a custom header, which cross-site forms cannot do and
 *    cross-origin scripts can only do after passing the CORS allowlist.
 * 2. If an Origin header is present it must be on the allowlist.
 * SameSite=Lax on the cookie is a third layer.
 */
export function createCsrfGuard(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return function csrfGuard(req, res, next) {
    if (req.get('x-requested-with') !== 'fetch') {
      throw AppError.forbidden('Request blocked for security reasons.', 'CSRF_REJECTED');
    }
    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) {
      throw AppError.forbidden('Request blocked for security reasons.', 'CSRF_REJECTED');
    }
    next();
  };
}
