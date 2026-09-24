import { AppError } from '../utils/AppError.js';

function formatIssues(issues) {
  return issues.slice(0, 30).map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

/**
 * Validates request parts with zod schemas. Parsed values are placed on req.valid
 * (unknown fields are stripped, so clients cannot sneak in e.g. "role": "director").
 */
export function validate({ body, query, params } = {}) {
  return function validator(req, res, next) {
    req.valid = req.valid || {};
    for (const [part, schema] of [
      ['params', params],
      ['query', query],
      ['body', body],
    ]) {
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) throw AppError.validation(formatIssues(result.error.issues));
      req.valid[part] = result.data;
    }
    next();
  };
}
