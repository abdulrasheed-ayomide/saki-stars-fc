import { Video, GalleryItem } from '../models/index.js';
import { idString } from '../utils/ids.js';
import { publicVideo } from '../serializers/index.js';

// Only media that is actually live on the website is ever offered to visitors.
const LIVE = { status: 'published', deletedAt: null };

const refId = (v) => (v ? idString(v._id ?? v) : null);

/**
 * Published media for a list of matches, in two queries whatever the list size:
 *   Map(matchId -> { fullMatch: publicVideo | null, highlights: publicVideo | null, photoCount })
 * A match whose linked video was unpublished or deleted simply gets null for it, so the website
 * never shows an action that leads nowhere.
 */
export async function publishedMatchMedia(matches) {
  const list = (matches || []).filter((m) => m && m._id);
  const out = new Map();
  if (!list.length) return out;
  const videoIds = new Set();
  for (const m of list) {
    for (const key of ['fullMatchVideo', 'highlightsVideo']) if (m[key]) videoIds.add(refId(m[key]));
  }
  const [videos, counts] = await Promise.all([
    videoIds.size ? Video.find({ _id: { $in: [...videoIds] }, ...LIVE }).lean() : [],
    GalleryItem.aggregate([{ $match: { match: { $in: list.map((m) => m._id) }, ...LIVE } }, { $group: { _id: '$match', n: { $sum: 1 } } }]),
  ]);
  const videoById = new Map(videos.map((v) => [idString(v._id), v]));
  const photos = new Map(counts.map((c) => [idString(c._id), c.n]));
  for (const m of list) {
    const full = videoById.get(refId(m.fullMatchVideo));
    const highlights = videoById.get(refId(m.highlightsVideo));
    out.set(idString(m._id), {
      fullMatch: full ? publicVideo(full) : null,
      highlights: highlights ? publicVideo(highlights) : null,
      photoCount: photos.get(idString(m._id)) || 0,
    });
  }
  return out;
}

export const NO_MEDIA = Object.freeze({ fullMatch: null, highlights: null, photoCount: 0 });

/** Adds `media` to serialized matches (same order as `docs`). */
export async function withMatchMedia(docs, serialize) {
  const media = await publishedMatchMedia(docs);
  return docs.map((m) => ({ ...serialize(m), media: media.get(idString(m._id)) || NO_MEDIA }));
}
