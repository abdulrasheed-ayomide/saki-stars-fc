import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

function handler(message) {
  return (req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message, requestId: req.id },
    });
  };
}

/** Baseline limit for the whole API. */
export function createApiLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: handler('Too many requests. Please wait a moment and try again.'),
  });
}

/**
 * Stricter limits for sensitive routes (brute force, spam). In-memory store: correct for a
 * single server instance (Render free/starter). Use a shared store if you ever run several.
 */
export function createLimiters({ authMultiplier = 1 } = {}) {
  const make = (windowMinutes, limit, message, keyGenerator) =>
    rateLimit({
      windowMs: windowMinutes * 60 * 1000,
      limit: limit * authMultiplier,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: handler(message),
      ...(keyGenerator ? { keyGenerator } : {}),
    });

  const byUser = (req) => (req.auth?.user?._id ? `u:${req.auth.user._id}` : `ip:${ipKeyGenerator(req.ip)}`);
  // Many people can share one public IP (mobile carriers use carrier-grade NAT), so sign-in
  // limits are per IP *and* email; a looser per-IP limit still slows password spraying.
  const byIpAndEmail = (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase().slice(0, 254)}`;

  return {
    login: make(15, 10, 'Too many sign-in attempts. Please wait 15 minutes and try again.', byIpAndEmail),
    loginIp: make(15, 100, 'Too many sign-in attempts from this network. Please wait 15 minutes.'),
    register: make(60, 30, 'Too many accounts created from this network. Please try again later.'),
    passwordReset: make(15, 10, 'Too many requests. Please wait 15 minutes.', byIpAndEmail),
    emailResend: make(60, 5, 'Too many emails requested. Please wait an hour and try again.', byIpAndEmail),
    refresh: make(5, 300, 'Too many requests. Please wait a moment.'),
    contact: make(60, 5, 'You have sent several messages recently. Please wait an hour before sending another.', byIpAndEmail),
    newsletter: make(60, 10, 'Too many subscription requests. Please try again later.'),
    comments: make(10, 10, 'You are commenting too quickly. Please wait a few minutes.', byUser),
    uploads: make(60, 100, 'Upload limit reached. Please wait before uploading more files.', byUser),
    applications: make(60, 5, 'Too many applications submitted. Please try again later.', byUser),
    search: make(1, 60, 'Too many searches. Please slow down.'),
  };
}
