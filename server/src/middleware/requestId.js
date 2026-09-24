import { randomUUID } from 'node:crypto';

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gives every request an ID that is returned in the X-Request-Id header and in error
 * responses, so a user-reported error can be matched to the server log.
 */
export function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}
