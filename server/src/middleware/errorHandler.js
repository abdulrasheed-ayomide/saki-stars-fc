import { AppError } from '../utils/AppError.js';

export function notFound(req, res, next) {
  next(AppError.notFound(`No endpoint matches ${req.method} ${req.path}.`));
}

// Errors raised by express.json() before our code runs.
function fromBodyParser(err) {
  if (err.type === 'entity.parse.failed') return AppError.badRequest('The request body is not valid JSON.');
  if (err.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  if (err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') {
    return new AppError(415, 'UNSUPPORTED_ENCODING', 'The request encoding is not supported.');
  }
  return null;
}

/**
 * Converts every error into the standard response shape:
 * { error: { code, message, requestId, details? } }
 * Internal details (stack traces, database errors) are logged, never sent.
 */
export function createErrorHandler({ logger, exposeDetails = false }) {
  // Express identifies error handlers by their four arguments, so `next` must stay.
  return function errorHandler(err, req, res, next) {
    const known = err instanceof AppError ? err : fromBodyParser(err);

    if (known) {
      if (known.statusCode >= 500) logger.error('Request failed', { requestId: req.id, err });
      return res.status(known.statusCode).json({
        error: {
          code: known.code,
          message: known.message,
          requestId: req.id,
          ...(known.details ? { details: known.details } : {}),
        },
      });
    }

    logger.error('Unhandled error', { requestId: req.id, method: req.method, path: req.path, err });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side. Please try again.',
        requestId: req.id,
        ...(exposeDetails ? { details: { message: err.message, stack: err.stack } } : {}),
      },
    });
  };
}
