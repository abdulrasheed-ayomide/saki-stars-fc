import mongoose from 'mongoose';
import { AppError } from './AppError.js';

export function isObjectId(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

export function toObjectId(value, label = 'id') {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!isObjectId(value)) throw AppError.notFound(`The ${label} was not found.`);
  return new mongoose.Types.ObjectId(value);
}

export function idString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
}

export function sameId(a, b) {
  return a != null && b != null && idString(a) === idString(b);
}

/** Accepts either an ObjectId or a slug for public "/:id" routes. */
export function idOrSlugFilter(value) {
  return isObjectId(value) ? { _id: value } : { slug: String(value).toLowerCase().slice(0, 220) };
}
