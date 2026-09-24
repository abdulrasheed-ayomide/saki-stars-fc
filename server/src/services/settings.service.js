import { ClubSettings } from '../models/index.js';

let cache = null;
let cachedAt = 0;
const TTL_MS = 60_000;

/** The single ClubSettings document, created with defaults the first time it is needed. */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  let doc = await ClubSettings.findOne({ key: 'club' }).lean();
  if (!doc) {
    try {
      doc = (await ClubSettings.create({ key: 'club' })).toObject();
    } catch {
      doc = await ClubSettings.findOne({ key: 'club' }).lean(); // created concurrently
    }
  }
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

export function clearSettingsCache() {
  cache = null;
}
