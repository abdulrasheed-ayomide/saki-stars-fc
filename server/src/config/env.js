import { randomBytes } from 'node:crypto';
import { passwordProblems } from '../auth/password.js';

const NODE_ENVS = ['development', 'test', 'production'];
const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'];
const SAMESITE = ['lax', 'strict', 'none'];
const EMAIL_TRANSPORTS = ['resend', 'console', 'disabled'];

function toInt(value, fallback, name, problems, { min = 0 } = {}) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    problems.push(`${name} must be an integer >= ${min}`);
    return fallback;
  }
  return n;
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function parseOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Builds a validated, frozen configuration object from environment variables.
 * Throws a single error listing every problem so misconfiguration is fixed in one pass.
 */
export function loadConfig(env = process.env) {
  const problems = [];
  const warnings = [];

  const nodeEnv = env.NODE_ENV || 'development';
  if (!NODE_ENVS.includes(nodeEnv)) {
    problems.push(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`);
  }
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  // ---- Database -------------------------------------------------------------
  const mongodbUri = (env.MONGODB_URI || '').trim();
  if (!mongodbUri && !isTest) {
    problems.push('MONGODB_URI is required');
  } else if (mongodbUri && !/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    problems.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  } else if (/[<>]/.test(mongodbUri)) {
    problems.push(
      'MONGODB_URI still contains placeholder text such as <user>, <password> or <cluster>. ' +
        'Paste your real connection string from MongoDB Atlas (Database > Connect > Drivers).',
    );
  }

  // ---- Web / CORS ------------------------------------------------------------
  const corsOrigins = parseOrigins(env.CORS_ORIGINS);
  if (isProduction) {
    if (corsOrigins.length === 0) {
      problems.push('CORS_ORIGINS is required in production');
    }
    for (const origin of corsOrigins) {
      if (origin === '*') problems.push('CORS_ORIGINS must not contain "*" in production');
      else if (!origin.startsWith('https://')) problems.push(`CORS origin must use https in production: ${origin}`);
    }
  }

  const appUrl = (env.APP_URL || (isProduction ? '' : 'http://localhost:5173')).replace(/\/+$/, '');
  if (!appUrl) problems.push('APP_URL is required in production (the public website address, used in email links)');
  else if (isProduction && !appUrl.startsWith('https://')) problems.push('APP_URL must use https in production');

  const logLevel = env.LOG_LEVEL || (isTest ? 'silent' : isProduction ? 'info' : 'debug');
  if (!LOG_LEVELS.includes(logLevel)) {
    problems.push(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`);
  }

  // ---- Auth -------------------------------------------------------------------
  let jwtSecret = env.JWT_ACCESS_SECRET || '';
  if (!jwtSecret) {
    if (isProduction) problems.push('JWT_ACCESS_SECRET is required in production (at least 32 random characters)');
    else {
      jwtSecret = randomBytes(48).toString('hex');
      if (!isTest) warnings.push('JWT_ACCESS_SECRET is not set; using a temporary secret. Everyone is signed out when the server restarts.');
    }
  } else if (jwtSecret.length < 32) {
    problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }

  const cookieSameSite = (env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (!SAMESITE.includes(cookieSameSite)) problems.push(`COOKIE_SAMESITE must be one of: ${SAMESITE.join(', ')}`);
  const cookieSecure = toBool(env.COOKIE_SECURE, isProduction);
  if (cookieSameSite === 'none' && !cookieSecure) problems.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  if (isProduction && !cookieSecure) problems.push('COOKIE_SECURE must be true in production');

  // ---- First Director (admin) bootstrap -------------------------------------------
  // Checked here so a typo or weak password is reported at start-up, not silently ignored.
  // The password itself is NOT copied into config; server.js reads it once from the environment.
  const directorEmail = (env.DIRECTOR_EMAIL || '').trim().toLowerCase();
  const directorPassword = env.DIRECTOR_PASSWORD || '';
  if (directorEmail || directorPassword) {
    if (!directorEmail || !directorPassword) {
      problems.push('Set both DIRECTOR_EMAIL and DIRECTOR_PASSWORD (or neither)');
    } else {
      if (!/^\S+@\S+\.\S+$/.test(directorEmail)) problems.push('DIRECTOR_EMAIL is not a valid email address');
      const weak = passwordProblems(directorPassword, { email: directorEmail, name: env.DIRECTOR_NAME || '' });
      if (weak.length) problems.push(`DIRECTOR_PASSWORD is too weak: ${weak.join(' ')}`);
    }
  }

  // ---- Email -----------------------------------------------------------------
  const resendApiKey = env.RESEND_API_KEY || '';
  let emailTransport = (env.EMAIL_TRANSPORT || '').toLowerCase();
  if (!emailTransport) emailTransport = resendApiKey ? 'resend' : isTest ? 'disabled' : isProduction ? 'resend' : 'console';
  if (!EMAIL_TRANSPORTS.includes(emailTransport)) problems.push(`EMAIL_TRANSPORT must be one of: ${EMAIL_TRANSPORTS.join(', ')}`);
  if (emailTransport === 'console' && isProduction) problems.push('EMAIL_TRANSPORT=console is not allowed in production');
  if (emailTransport === 'resend' && !resendApiKey) problems.push('RESEND_API_KEY is required when EMAIL_TRANSPORT=resend');
  const emailFrom = env.EMAIL_FROM || '';
  if (emailTransport === 'resend' && !emailFrom) {
    problems.push('EMAIL_FROM is required when sending email, for example "Saki Stars <no-reply@your-club-domain.com>"');
  }

  // ---- Cloudinary ----------------------------------------------------------------
  const cloudinary = {
    cloudName: env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: env.CLOUDINARY_API_KEY || '',
    apiSecret: env.CLOUDINARY_API_SECRET || '',
    folder: (env.CLOUDINARY_FOLDER || 'saki-stars').replace(/^\/+|\/+$/g, ''),
  };
  const cloudinaryParts = [cloudinary.cloudName, cloudinary.apiKey, cloudinary.apiSecret].filter(Boolean).length;
  if (cloudinaryParts > 0 && cloudinaryParts < 3) {
    problems.push('Set all three of CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, or none of them');
  }
  cloudinary.enabled = cloudinaryParts === 3;
  if (!cloudinary.enabled && !isTest) warnings.push('Cloudinary is not configured; image and video uploads are disabled.');

  const config = {
    nodeEnv,
    isProduction,
    isTest,
    port: toInt(env.PORT, 4000, 'PORT', problems, { min: 1 }),
    mongodbUri,
    corsOrigins,
    appUrl,
    // Number of reverse proxies in front of the app (Render uses 1). Needed for correct client IPs in rate limiting.
    trustProxy: toInt(env.TRUST_PROXY, 0, 'TRUST_PROXY', problems),
    rateLimit: {
      windowMs: toInt(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 'RATE_LIMIT_WINDOW_MS', problems, { min: 1000 }),
      max: toInt(env.RATE_LIMIT_MAX, 300, 'RATE_LIMIT_MAX', problems, { min: 1 }),
      // Tests exercise auth endpoints many times; limits stay on but are generous there.
      authMultiplier: isTest ? 100 : 1,
    },
    logLevel,
    auth: {
      jwtSecret,
      accessTokenTtlMinutes: toInt(env.ACCESS_TOKEN_TTL_MINUTES, 15, 'ACCESS_TOKEN_TTL_MINUTES', problems, { min: 1 }),
      refreshTokenTtlDays: toInt(env.REFRESH_TOKEN_TTL_DAYS, 30, 'REFRESH_TOKEN_TTL_DAYS', problems, { min: 1 }),
      cookieSecure,
      cookieSameSite,
      cookieDomain: env.COOKIE_DOMAIN || undefined,
      bcryptRounds: toInt(env.BCRYPT_ROUNDS, isTest ? 4 : 12, 'BCRYPT_ROUNDS', problems, { min: 4 }),
    },
    email: {
      transport: emailTransport,
      resendApiKey,
      from: emailFrom,
      replyTo: env.EMAIL_REPLY_TO || '',
      contactInbox: env.CONTACT_INBOX_EMAIL || '',
    },
    cloudinary,
    uploads: {
      maxImageBytes: toInt(env.MAX_IMAGE_MB, 8, 'MAX_IMAGE_MB', problems, { min: 1 }) * 1024 * 1024,
      maxVideoBytes: toInt(env.MAX_VIDEO_MB, 100, 'MAX_VIDEO_MB', problems, { min: 1 }) * 1024 * 1024,
      maxVideoSeconds: toInt(env.MAX_VIDEO_SECONDS, 600, 'MAX_VIDEO_SECONDS', problems, { min: 10 }),
      maxDocumentBytes: toInt(env.MAX_DOCUMENT_MB, 10, 'MAX_DOCUMENT_MB', problems, { min: 1 }) * 1024 * 1024,
    },
    warnings,
  };

  if (problems.length > 0) {
    const error = new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
    error.problems = problems;
    throw error;
  }

  return deepFreeze(config);
}

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return Object.freeze(obj);
}
