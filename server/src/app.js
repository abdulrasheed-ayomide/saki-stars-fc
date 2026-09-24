import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestId } from './middleware/requestId.js';
import { createApiLimiter, createLimiters } from './middleware/rateLimit.js';
import { notFound, createErrorHandler } from './middleware/errorHandler.js';
import { createRequireDb } from './middleware/requireDb.js';
import { rejectOperatorKeys } from './middleware/rejectOperatorKeys.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createCsrfGuard } from './middleware/csrf.js';
import { createUploadMiddleware } from './middleware/upload.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { isDatabaseReady as defaultIsDatabaseReady } from './db/connection.js';
import { createTokenService } from './services/token.service.js';
import { createEmailService } from './services/email.service.js';
import { createMediaService } from './services/media.service.js';
import { createAuditService } from './services/audit.service.js';
import { createNotificationService } from './services/notification.service.js';
import { getSettings } from './services/settings.service.js';
import { mountRoutes } from './routes.js';

/**
 * Builds the Express application. Dependencies can be passed in so tests can
 * create an app without real email or media providers.
 */
export function createApp({ config, logger, isDatabaseReady = defaultIsDatabaseReady, services = {} }) {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(helmet());

  const allowed = new Set(config.corsOrigins);
  app.use(
    cors({
      // Requests with no Origin (server-to-server, health checks) are allowed; browsers must be on the allowlist.
      origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id', 'Date'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(rejectOperatorKeys);

  // ---- Shared services (one instance per app) -------------------------------
  const tokens = services.tokens ?? createTokenService(config);
  const audit = services.audit ?? createAuditService({ logger });
  const email =
    services.email ??
    createEmailService({
      config,
      logger,
      getClubName: async () => {
        try {
          return (await getSettings()).name;
        } catch {
          return 'Saki Stars Sports Club';
        }
      },
    });
  const media = services.media ?? createMediaService(config);
  const notifications = services.notifications ?? createNotificationService({ logger });
  const authMw = createAuthMiddleware({ tokens, audit });
  const limiters = createLimiters({ authMultiplier: config.rateLimit.authMultiplier });
  const csrf = createCsrfGuard(config.corsOrigins);
  const upload = createUploadMiddleware(config);

  const ctx = { config, logger, tokens, audit, email, media, notifications, auth: authMw, limiters, csrf, upload };
  app.locals.ctx = ctx;

  const api = express.Router();
  // Health is registered before the limiter so uptime monitors are never throttled.
  api.use('/health', createHealthRouter({ isDatabaseReady }));
  api.use(createApiLimiter(config.rateLimit));
  api.use(createRequireDb(isDatabaseReady));
  mountRoutes(api, ctx);

  app.use('/api/v1', api);

  app.use(notFound);
  app.use(createErrorHandler({ logger, exposeDetails: !config.isProduction }));

  return app;
}
