import { loadConfig } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { ensureDirectorFromEnv } from './auth/bootstrapDirector.js';
import { migrateLegacyVideoCategories } from './models/Content.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  process.stderr.write(`\n${err.message}\n\nFix server/.env (or the host's environment settings) and start again.\n\n`);
  process.exit(1);
}

const logger = createLogger({ level: config.logLevel, json: config.isProduction });
for (const warning of config.warnings) logger.warn(warning);

const app = createApp({ config, logger });

// Render (and most hosts) provide PORT; locally it defaults to 4000.
const server = app.listen(config.port, () => {
  logger.info('API listening', { port: config.port, env: config.nodeEnv });
});

connectDatabase({ uri: config.mongodbUri, logger })
  .then(async () => {
    // First-run admin: creates the Club Director from DIRECTOR_EMAIL / DIRECTOR_PASSWORD
    // only while no Director exists. The password is read here, never stored in config.
    try {
      await ensureDirectorFromEnv({
        email: process.env.DIRECTOR_EMAIL,
        name: process.env.DIRECTOR_NAME,
        password: process.env.DIRECTOR_PASSWORD,
        rounds: config.auth.bcryptRounds,
        logger,
      });
    } catch (err) {
      logger.error('Could not create the Club Director from the environment', { reason: err.message });
    }
    // Small, idempotent data repairs for renamed values (safe on every start).
    try {
      const renamed = await migrateLegacyVideoCategories();
      if (renamed) logger.info('Updated renamed video categories', { videos: renamed });
    } catch (err) {
      logger.error('Could not update renamed video categories', { reason: err.message });
    }
  })
  .catch((err) => {
    logger.error('Could not connect to MongoDB; shutting down', { reason: err.message });
    process.exit(1);
  });

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal });
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await disconnectDatabase().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason : String(reason) });
});
