import multer from 'multer';
import { AppError } from '../utils/AppError.js';

/** Single file, kept in memory only long enough to validate and stream to Cloudinary. */
export function createUploadMiddleware(config) {
  const maxBytes = Math.max(config.uploads.maxImageBytes, config.uploads.maxVideoBytes, config.uploads.maxDocumentBytes);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 20 } }).single('file');

  return function singleFile(req, res, next) {
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(AppError.badRequest('The file is too large.'));
      return next(AppError.badRequest('The upload could not be read.'));
    });
  };
}
