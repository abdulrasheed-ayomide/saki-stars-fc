import { AppError } from '../utils/AppError.js';

function hasOperatorKey(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((v) => hasOperatorKey(v, depth + 1));
  for (const [key, v] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('\0') || key === '__proto__' || key === 'constructor') return true;
    if (hasOperatorKey(v, depth + 1)) return true;
  }
  return false;
}

/** Defence in depth against NoSQL operator injection and prototype pollution in request data. */
export function rejectOperatorKeys(req, res, next) {
  if (hasOperatorKey(req.body) || hasOperatorKey(req.query) || hasOperatorKey(req.params)) {
    throw AppError.badRequest('The request contains characters that are not allowed.');
  }
  next();
}
