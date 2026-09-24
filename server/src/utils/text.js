import { randomBytes } from 'node:crypto';

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" filter for simple search boxes. */
export function containsRegex(value) {
  return new RegExp(escapeRegex(String(value).trim().slice(0, 100)), 'i');
}

export function slugify(value) {
  return (
    String(value)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'item'
  );
}

/** Returns a slug that is not used yet by `Model`, adding a short suffix if needed. */
export async function uniqueSlug(Model, base, { excludeId } = {}) {
  const root = slugify(base);
  let candidate = root;
  for (let i = 0; i < 8; i += 1) {
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    if (!(await Model.exists(filter))) return candidate;
    candidate = `${root}-${randomBytes(2).toString('hex')}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export function fullName(p) {
  return [p?.firstName, p?.lastName].filter(Boolean).join(' ');
}

export function ageOn(dateOfBirth, on = new Date()) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}
