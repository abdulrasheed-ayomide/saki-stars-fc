import { AppError } from '../utils/AppError.js';

/** Returns 503 immediately (instead of hanging) while the database is not connected. */
export function createRequireDb(isDatabaseReady) {
  return function requireDb(req, res, next) {
    if (!isDatabaseReady()) {
      throw AppError.unavailable('The club database is not available right now. Please try again in a moment.', 'DATABASE_UNAVAILABLE');
    }
    next();
  };
}
