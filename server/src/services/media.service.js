import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';
import { AppError } from '../utils/AppError.js';

export const MEDIA_FOLDERS = ['players', 'staff', 'teams', 'competitions', 'news', 'matches', 'gallery', 'videos', 'club', 'documents', 'scouting'];

const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const DOCUMENT_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Checks the file's first bytes, because the browser-supplied MIME type can be faked. */
export function sniffType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const hex = buffer.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (hex.startsWith('1a45dfa3')) return 'video/webm';
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    return brand.startsWith('qt') ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}

export function createMediaService(config) {
  const { enabled, cloudName, apiKey, apiSecret, folder: rootFolder } = config.cloudinary;
  if (enabled) cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

  function ensureEnabled() {
    if (!enabled) {
      throw AppError.unavailable(
        'File uploads are not configured yet. Ask the IT Manager to add the Cloudinary settings.',
        'UPLOADS_NOT_CONFIGURED',
      );
    }
  }

  /**
   * Validates and uploads a file held in memory.
   * kind: 'image' | 'video' | 'document'. Private documents use Cloudinary "private" delivery,
   * so they can only be opened through a short-lived signed link from the API.
   */
  async function upload(file, { kind, folder, isPrivate = false }) {
    ensureEnabled();
    if (!file?.buffer) throw AppError.badRequest('No file was received.');
    if (!MEDIA_FOLDERS.includes(folder)) throw AppError.badRequest('Unknown upload folder.');

    const detected = sniffType(file.buffer);
    const allowed = kind === 'image' ? IMAGE_TYPES : kind === 'video' ? VIDEO_TYPES : DOCUMENT_TYPES;
    if (!detected || !allowed[detected]) {
      const names = Object.values(allowed).join(', ').toUpperCase();
      throw AppError.badRequest(`This file type is not allowed. Use: ${names}.`);
    }
    if (file.mimetype && file.mimetype !== detected && !(detected === 'video/mp4' && file.mimetype === 'video/quicktime')) {
      throw AppError.badRequest('The file does not match its declared type.');
    }
    const max = kind === 'image' ? config.uploads.maxImageBytes : kind === 'video' ? config.uploads.maxVideoBytes : config.uploads.maxDocumentBytes;
    if (file.size > max) throw AppError.badRequest(`The file is too large. The limit is ${Math.round(max / 1024 / 1024)} MB.`);

    const resourceType = kind === 'video' ? 'video' : detected === 'application/pdf' ? 'raw' : 'image';
    const options = {
      folder: `${rootFolder}/${folder}`,
      resource_type: resourceType,
      type: isPrivate ? 'private' : 'upload',
      overwrite: false,
      unique_filename: true,
      use_filename: false,
    };
    if (resourceType === 'image' && !isPrivate) {
      // Store a sensibly sized master; delivery URLs add f_auto,q_auto and widths.
      options.transformation = [{ width: 2400, height: 2400, crop: 'limit' }];
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (err, res) => (err ? reject(err) : resolve(res)));
      Readable.from(file.buffer).pipe(stream);
    }).catch(() => {
      throw AppError.unavailable('The file could not be uploaded. Please try again.', 'UPLOAD_FAILED');
    });

    if (kind === 'video' && result.duration && result.duration > config.uploads.maxVideoSeconds) {
      await destroy({ publicId: result.public_id, resourceType: 'video' });
      throw AppError.badRequest(`Videos can be at most ${Math.round(config.uploads.maxVideoSeconds / 60)} minutes long.`);
    }

    return {
      publicId: result.public_id,
      url: result.secure_url,
      resourceType,
      deliveryType: isPrivate ? 'private' : 'upload',
      format: result.format || allowed[detected],
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      duration: result.duration,
    };
  }

  async function destroy(media) {
    if (!enabled || !media?.publicId) return;
    try {
      await cloudinary.uploader.destroy(media.publicId, {
        resource_type: media.resourceType || 'image',
        type: media.deliveryType || 'upload',
        invalidate: true,
      });
    } catch {
      // Orphaned files are harmless; never fail the user's action because clean-up failed.
    }
  }

  /** Short-lived link to a private file (player documents, scouting attachments). */
  function privateUrl(media, { expiresInSeconds = 300 } = {}) {
    ensureEnabled();
    return cloudinary.utils.private_download_url(media.publicId, media.format, {
      resource_type: media.resourceType || 'image',
      type: 'private',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }

  return { enabled, upload, destroy, privateUrl };
}
