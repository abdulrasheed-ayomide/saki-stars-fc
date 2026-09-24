/**
 * An error that is safe to show to API clients.
 * Anything that is NOT an AppError is treated as an unexpected internal error
 * and its details are hidden from the response.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'The request is invalid.', details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details, message = 'Some fields are missing or invalid.') {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Please sign in to continue.', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to do this.', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  static notFound(message = 'The requested resource was not found.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message = 'This conflicts with existing data.', code = 'CONFLICT') {
    return new AppError(409, code, message);
  }

  static unavailable(message = 'This service is temporarily unavailable. Please try again shortly.', code = 'SERVICE_UNAVAILABLE') {
    return new AppError(503, code, message);
  }
}
