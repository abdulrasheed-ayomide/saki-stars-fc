import { loadConfig } from '../src/config/env.js';
import { createLogger } from '../src/utils/logger.js';
import { createApp } from '../src/app.js';

export function buildTestApp({ env = {}, isDatabaseReady = () => true } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', CORS_ORIGINS: 'http://localhost:5173', ...env });
  const logger = createLogger({ level: 'silent' });
  return createApp({ config, logger, isDatabaseReady });
}
