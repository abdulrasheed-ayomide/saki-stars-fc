import { Router } from 'express';
import { z } from 'zod';
import { Video, GalleryItem, Match, Team } from '../../models/index.js';
import { VIDEO_CATEGORIES, GALLERY_CATEGORIES, normalizeVideoCategory } from '../../models/Content.js';

// Accepts renamed categories in links/filters made before the rename (e.g. ?category=Youth).
const videoCategoryQuery = z.preprocess(normalizeVideoCategory, z.enum(VIDEO_CATEGORIES));
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, mediaInput, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { containsRegex } from '../../utils/text.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { publicVideo, adminVideo, publicGalleryItem, adminGalleryItem } from '../../serializers/index.js';
import { MATCH_POPULATE } from '../football/teams.routes.js';

/** Extracts the 11-character video ID from any common YouTube link format. */
export function parseYouTubeId(input) {
  const value = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return url.pathname.slice(1, 12);
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.searchParams.get('v')) return url.searchParams.get('v').slice(0, 11);
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

// Which permission allows uploading into which folder.
const UPLOAD_PERMISSIONS = {
  players: ['players.edit', 'players.create'],
  staff: ['staff.profiles.manage'],
  teams: ['teams.manage'],
  competitions: ['competitions.manage'],
  news: ['news.create', 'news.edit'],
  matches: ['media.manage', 'matches.manage'],
  gallery: ['media.manage'],
  videos: ['media.manage'],
  club: ['settings.manage'],
  scouting: ['scouting.manage'],
};

const VIDEO_POP = [
  { path: 'team', select: 'name shortName slug logo isClubTeam' },
  { path: 'match', populate: MATCH_POPULATE },
];

export function createMediaRouters({ auth, audit, config, media, upload, limiters }) {
  const uploads = Router();
  const videosPub = Router();
  const videosAdmin = Router();
  const galleryPub = Router();
  const galleryAdmin = Router();

  // ---- Upload -------------------------------------------------------------------------
  uploads.post(
    '/upload',
    auth.requireAuth,
    auth.requireStaff,
    limiters.uploads,
    validate({ query: z.object({ folder: z.enum(Object.keys(UPLOAD_PERMISSIONS)), kind: z.enum(['image', 'video']).optional().default('image') }) }),
    (req, res, next) => auth.requirePermission(...UPLOAD_PERMISSIONS[req.valid.query.folder])(req, res, next),
    upload,
    async (req, res) => {
      const { folder, kind } = req.valid.query;
      if (kind === 'video' && !['videos', 'matches'].includes(folder)) throw AppError.badRequest('Videos can only be uploaded to the video library.');
      const isPrivate = folder === 'scouting';
      const file = await media.upload(req.file, { kind, folder, isPrivate });
      await audit(req, { action: 'media.uploaded', entityType: 'Media', entityId: file.publicId.slice(-60), metadata: { folder, kind, bytes: file.bytes } });
      res.status(201).json({ data: { ...file, alt: String(req.body?.alt || '').slice(0, 300) } });
    },
  );

  // ---- Videos -------------------------------------------------------------------------
  videosPub.get(
    '/',
    validate({ query: z.object({ category: videoCategoryQuery.optional(), team: objectId.optional(), q: z.string().max(100).optional(), featured: z.enum(['true']).optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { category, team, q, featured } = req.valid.query;
      const filter = { status: 'published', deletedAt: null };
      if (category) filter.category = category;
      if (team) filter.team = team;
      if (featured) filter.featured = true;
      if (q) filter.title = containsRegex(q);
      const result = await findPaged(Video, filter, getPaging(req.valid.query, { defaultLimit: 12, maxLimit: 48 }), (qq) => qq.sort({ featured: -1, publishedAt: -1 }).populate(VIDEO_POP));
      res.json({ data: { ...result, items: result.items.map(publicVideo), categories: VIDEO_CATEGORIES } });
    },
  );

  videosPub.get('/:id', validate({ params: idParams }), async (req, res) => {
    const v = await Video.findOne({ _id: req.valid.params.id, status: 'published', deletedAt: null }).populate(VIDEO_POP).lean();
    if (!v) throw AppError.notFound('Video not found.');
    res.json({ data: publicVideo(v) });
  });

  videosAdmin.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('media.manage'));

  const videoSchema = z
    .object({
      title: z.string().trim().min(3).max(200),
      description: z.string().trim().max(3000).optional().default(''),
      category: videoCategoryQuery,
      source: z.enum(['youtube', 'cloudinary']),
      youtubeUrl: z.string().trim().max(300).optional().default(''),
      media: mediaInput(config),
      thumbnailUrl: z.string().trim().max(1000).optional().default(''),
      team: objectId.nullable().optional(),
      match: objectId.nullable().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional().default('published'),
      featured: z.boolean().optional().default(false),
      publishedAt: z.coerce.date().nullable().optional(),
    })
    .superRefine((v, ctx) => {
      if (v.source === 'youtube' && !parseYouTubeId(v.youtubeUrl)) ctx.addIssue({ code: 'custom', path: ['youtubeUrl'], message: 'Paste a valid YouTube link.' });
      if (v.source === 'cloudinary' && (!v.media || v.media.resourceType !== 'video')) ctx.addIssue({ code: 'custom', path: ['media'], message: 'Upload a video file.' });
      if (v.thumbnailUrl && !v.thumbnailUrl.startsWith(`https://res.cloudinary.com/${config.cloudinary.cloudName}/`)) {
        ctx.addIssue({ code: 'custom', path: ['thumbnailUrl'], message: 'Upload the thumbnail through the website.' });
      }
    });

  function toDoc(body) {
    const { youtubeUrl, ...rest } = body;
    return {
      ...rest,
      youtubeId: body.source === 'youtube' ? parseYouTubeId(youtubeUrl) : '',
      media: body.source === 'cloudinary' ? body.media : null,
      thumbnailUrl:
        body.thumbnailUrl ||
        (body.source === 'cloudinary' && body.media ? body.media.url.replace(/\.[a-z0-9]+$/i, '.jpg') : ''),
      publishedAt: body.status === 'published' ? body.publishedAt || new Date() : body.publishedAt || null,
    };
  }

  async function checkRefs(body) {
    if (body.team && !(await Team.exists({ _id: body.team }))) throw AppError.validation([{ path: 'team', message: 'Team not found.' }]);
    if (body.match && !(await Match.exists({ _id: body.match }))) throw AppError.validation([{ path: 'match', message: 'Match not found.' }]);
  }

  videosAdmin.get('/', validate({ query: z.object({ status: z.enum(['draft', 'published', 'archived']).optional(), category: videoCategoryQuery.optional(), q: z.string().max(100).optional(), ...pagingQuery }) }), async (req, res) => {
    const { status, category, q } = req.valid.query;
    const filter = { deletedAt: null };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (q) filter.title = containsRegex(q);
    const result = await findPaged(Video, filter, getPaging(req.valid.query, { defaultLimit: 30 }), (qq) => qq.sort({ createdAt: -1 }).populate(VIDEO_POP));
    res.json({ data: { ...result, items: result.items.map(adminVideo), categories: VIDEO_CATEGORIES } });
  });

  videosAdmin.get('/:id', validate({ params: idParams }), async (req, res) => {
    const v = await Video.findOne({ _id: req.valid.params.id, deletedAt: null }).populate(VIDEO_POP).lean();
    if (!v) throw AppError.notFound('Video not found.');
    res.json({ data: { ...adminVideo(v), youtubeUrl: v.youtubeId ? `https://www.youtube.com/watch?v=${v.youtubeId}` : '', rawMedia: v.media } });
  });

  videosAdmin.post('/', validate({ body: videoSchema }), async (req, res) => {
    await checkRefs(req.valid.body);
    const v = await Video.create({ ...toDoc(req.valid.body), createdBy: req.auth.user._id });
    await audit(req, { action: 'video.created', entityType: 'Video', entityId: v._id, metadata: { title: v.title, source: v.source, status: v.status } });
    res.status(201).json({ data: adminVideo(v.toObject()) });
  });

  videosAdmin.put('/:id', validate({ params: idParams, body: videoSchema }), async (req, res) => {
    await checkRefs(req.valid.body);
    const v = await Video.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!v) throw AppError.notFound('Video not found.');
    const oldMedia = v.media?.publicId ? v.media.toObject() : null;
    v.set(toDoc(req.valid.body));
    await v.save();
    if (oldMedia && oldMedia.publicId !== v.media?.publicId) await media.destroy(oldMedia);
    await audit(req, { action: 'video.updated', entityType: 'Video', entityId: v._id, metadata: { title: v.title, status: v.status } });
    res.json({ data: adminVideo(v.toObject()) });
  });

  videosAdmin.delete('/:id', validate({ params: idParams }), async (req, res) => {
    const v = await Video.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!v) throw AppError.notFound('Video not found.');
    v.deletedAt = new Date();
    v.status = 'archived';
    await v.save();
    await Match.updateMany({ highlightsVideo: v._id }, { $set: { highlightsVideo: null } });
    await audit(req, { action: 'video.deleted', entityType: 'Video', entityId: v._id, metadata: { title: v.title } });
    res.json({ data: { id: idString(v._id) } });
  });

  // ---- Gallery ------------------------------------------------------------------------
  const GALLERY_POP = [
    { path: 'team', select: 'name shortName slug logo isClubTeam' },
    { path: 'match', populate: MATCH_POPULATE },
  ];

  galleryPub.get(
    '/',
    validate({ query: z.object({ category: z.enum(GALLERY_CATEGORIES).optional(), team: objectId.optional(), match: objectId.optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { category, team, match } = req.valid.query;
      const filter = { status: 'published', deletedAt: null };
      if (category) filter.category = category;
      if (team) filter.team = team;
      if (match) filter.match = match;
      const result = await findPaged(GalleryItem, filter, getPaging(req.valid.query, { defaultLimit: 24, maxLimit: 60 }), (qq) => qq.sort({ takenAt: -1, createdAt: -1 }).populate(GALLERY_POP));
      res.json({ data: { ...result, items: result.items.map(publicGalleryItem), categories: GALLERY_CATEGORIES } });
    },
  );

  galleryAdmin.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('media.manage'));

  const gallerySchema = z.object({
    title: z.string().trim().max(200).optional().default(''),
    caption: z.string().trim().max(1000).optional().default(''),
    category: z.enum(GALLERY_CATEGORIES),
    image: mediaInput(config).refine((m) => m && m.resourceType === 'image', 'Upload an image.'),
    team: objectId.nullable().optional(),
    match: objectId.nullable().optional(),
    takenAt: z.coerce.date().nullable().optional(),
    photographer: z.string().trim().max(120).optional().default(''),
    status: z.enum(['published', 'hidden']).optional().default('published'),
  });

  galleryAdmin.get('/', validate({ query: z.object({ category: z.enum(GALLERY_CATEGORIES).optional(), status: z.enum(['published', 'hidden']).optional(), ...pagingQuery }) }), async (req, res) => {
    const { category, status } = req.valid.query;
    const filter = { deletedAt: null };
    if (category) filter.category = category;
    if (status) filter.status = status;
    const result = await findPaged(GalleryItem, filter, getPaging(req.valid.query, { defaultLimit: 40 }), (qq) => qq.sort({ createdAt: -1 }).populate(GALLERY_POP));
    res.json({ data: { ...result, items: result.items.map(adminGalleryItem), categories: GALLERY_CATEGORIES } });
  });

  galleryAdmin.post('/', validate({ body: gallerySchema }), async (req, res) => {
    await checkRefs(req.valid.body);
    const g = await GalleryItem.create({ ...req.valid.body, uploadedBy: req.auth.user._id });
    await audit(req, { action: 'gallery.created', entityType: 'GalleryItem', entityId: g._id, metadata: { category: g.category } });
    res.status(201).json({ data: adminGalleryItem(g.toObject()) });
  });

  galleryAdmin.put('/:id', validate({ params: idParams, body: gallerySchema }), async (req, res) => {
    await checkRefs(req.valid.body);
    const g = await GalleryItem.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!g) throw AppError.notFound('Image not found.');
    const old = g.image?.publicId ? g.image.toObject() : null;
    g.set(req.valid.body);
    await g.save();
    if (old && old.publicId !== g.image.publicId) await media.destroy(old);
    await audit(req, { action: 'gallery.updated', entityType: 'GalleryItem', entityId: g._id });
    res.json({ data: adminGalleryItem(g.toObject()) });
  });

  galleryAdmin.delete('/:id', validate({ params: idParams }), async (req, res) => {
    const g = await GalleryItem.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!g) throw AppError.notFound('Image not found.');
    g.deletedAt = new Date();
    g.status = 'hidden';
    await g.save();
    await audit(req, { action: 'gallery.deleted', entityType: 'GalleryItem', entityId: g._id });
    res.json({ data: { id: idString(g._id) } });
  });

  return { uploads, videosPub, videosAdmin, galleryPub, galleryAdmin };
}
