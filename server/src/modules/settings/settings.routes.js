import { Router } from 'express';
import { publicPlayerFilter } from '../players/players.routes.js';
import { z } from 'zod';
import { ClubSettings, Team, Player, Match } from '../../models/index.js';
import { currentSeason } from '../football/seasons.routes.js';
import { validate } from '../../middleware/validate.js';
import { mediaInput, httpsUrl } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { getSettings, clearSettingsCache } from '../../services/settings.service.js';
import { publicMedia } from '../../serializers/index.js';

function publicSettings(s) {
  return {
    name: s.name,
    shortName: s.shortName,
    tagline: s.tagline,
    heroHeadline: s.heroHeadline,
    heroText: s.heroText,
    logo: publicMedia(s.logo),
    heroImage: publicMedia(s.heroImage),
    founded: s.founded,
    about: s.about,
    history: s.history,
    mission: s.mission,
    vision: s.vision,
    values: s.values || [],
    honours: s.honours || [],
    stadium: { ...(s.stadium || {}), image: publicMedia(s.stadium?.image) },
    contact: s.contact || {},
    social: s.social || {},
    seo: { title: s.seo?.title || '', description: s.seo?.description || '', image: publicMedia(s.seo?.image) },
    timezone: s.timezone || 'Africa/Lagos',
    features: s.features || {},
    legalVersions: {
      terms: s.legal?.terms?.version || '1.0',
      privacy: s.legal?.privacy?.version || '1.0',
      cookies: s.legal?.cookies?.version || '1.0',
    },
    updatedAt: s.updatedAt,
  };
}

export function createSettingsRouters({ auth, audit, config, media }) {
  const pub = Router();
  const admin = Router();

  pub.get('/settings', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: publicSettings(await getSettings()) });
  });

  // Real club numbers for the homepage (never invented: zero when the database is empty).
  pub.get('/club-stats', async (req, res) => {
    const season = await currentSeason();
    const clubTeams = await Team.find({ isClubTeam: true, status: 'active' }).select('_id').lean();
    const ids = new Set(clubTeams.map((t) => String(t._id)));
    const [players, matches] = await Promise.all([
      Player.countDocuments(await publicPlayerFilter()),
      season
        ? Match.find({ season: season._id, status: 'completed', deletedAt: null, $or: [{ homeTeam: { $in: [...ids] } }, { awayTeam: { $in: [...ids] } }] })
            .select('homeTeam awayTeam score')
            .lean()
        : [],
    ]);
    const record = { played: 0, won: 0, drawn: 0, lost: 0, goalsScored: 0, cleanSheets: 0 };
    for (const m of matches) {
      const home = ids.has(String(m.homeTeam));
      const gf = home ? m.score?.home : m.score?.away;
      const ga = home ? m.score?.away : m.score?.home;
      if (gf == null || ga == null) continue;
      record.played += 1;
      record.goalsScored += gf;
      if (ga === 0) record.cleanSheets += 1;
      if (gf > ga) record.won += 1;
      else if (gf === ga) record.drawn += 1;
      else record.lost += 1;
    }
    const settings = await getSettings();
    res.set('Cache-Control', 'public, max-age=120');
    res.json({
      data: {
        teams: ids.size,
        players,
        honours: (settings.honours || []).length,
        founded: settings.founded || '',
        season: season ? { id: String(season._id), name: season.name, ...record } : null,
      },
    });
  });

  pub.get('/legal/:doc', validate({ params: z.object({ doc: z.enum(['terms', 'privacy', 'cookies']) }) }), async (req, res) => {
    const s = await getSettings();
    const doc = s.legal?.[req.valid.params.doc] || {};
    res.json({ data: { version: doc.version || '1.0', body: doc.body || '', updatedAt: doc.updatedAt || null, approved: Boolean(doc.approved) } });
  });

  admin.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('settings.manage'));

  const text = (max) => z.string().trim().max(max).optional().default('');
  const settingsSchema = z.object({
    name: z.string().trim().min(2).max(120),
    shortName: z.string().trim().min(2).max(40),
    tagline: text(200),
    heroHeadline: text(200),
    heroText: text(600),
    logo: mediaInput(config),
    heroImage: mediaInput(config),
    founded: text(20),
    about: text(10000),
    history: text(20000),
    mission: text(2000),
    vision: text(2000),
    values: z.array(z.object({ title: z.string().trim().min(1).max(80), description: text(600) })).max(12).optional().default([]),
    honours: z.array(z.object({ title: z.string().trim().min(1).max(150), competition: text(150), years: text(200) })).max(50).optional().default([]),
    stadium: z
      .object({ name: text(150), address: text(300), capacity: z.number().int().min(0).max(200000).nullable().optional(), description: text(3000), mapUrl: httpsUrl.optional().default(''), image: mediaInput(config) })
      
      .prefault({}),
    contact: z.object({ email: z.string().trim().max(254).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email.').optional().default(''), phone: text(40), address: text(300), officeHours: text(200) }).prefault({}),
    social: z.object({ facebook: httpsUrl, instagram: httpsUrl, x: httpsUrl, youtube: httpsUrl, tiktok: httpsUrl }).partial().prefault({}),
    seo: z.object({ title: text(120), description: text(300), image: mediaInput(config) }).prefault({}),
    timezone: z.string().trim().max(60).refine((tz) => {
      try {
        Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone.').optional().default('Africa/Lagos'),
    features: z.object({ comments: z.boolean(), newsletter: z.boolean(), playerApplications: z.boolean(), staffApplications: z.boolean() }).partial().prefault({}),
  });

  admin.get('/', async (req, res) => {
    const s = await getSettings({ fresh: true });
    res.json({ data: { ...publicSettings(s), logo: s.logo, heroImage: s.heroImage, stadium: s.stadium, seo: s.seo, legal: s.legal } });
  });

  admin.put('/', validate({ body: settingsSchema }), async (req, res) => {
    const before = await getSettings({ fresh: true });
    const updated = await ClubSettings.findOneAndUpdate(
      { key: 'club' },
      { $set: { ...req.valid.body, updatedBy: req.auth.user._id } },
      { returnDocument: 'after', upsert: true, runValidators: true },
    ).lean();
    clearSettingsCache();
    for (const key of ['logo', 'heroImage']) {
      if (before[key]?.publicId && before[key].publicId !== updated[key]?.publicId) await media.destroy(before[key]);
    }
    const changed = Object.keys(req.valid.body).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(updated[k] ?? null));
    await audit(req, { action: 'settings.updated', entityType: 'ClubSettings', entityId: 'club', metadata: { changed } });
    res.json({ data: publicSettings(updated) });
  });

  // Legal documents are versioned: publishing a new version asks users to accept it again.
  admin.put(
    '/legal/:doc',
    validate({
      params: z.object({ doc: z.enum(['terms', 'privacy', 'cookies']) }),
      body: z.object({ body: z.string().trim().max(60000), version: z.string().trim().regex(/^\d+(\.\d+){0,2}$/, 'Use a version like 1.1 or 2.0.'), approved: z.boolean() }),
    }),
    async (req, res) => {
      const { doc } = req.valid.params;
      const before = (await getSettings({ fresh: true })).legal?.[doc] || {};
      const { body, version, approved } = req.valid.body;
      if (before.version && before.body && version === before.version && body !== before.body) {
        throw AppError.validation([{ path: 'version', message: 'The text changed, so give it a new version number.' }]);
      }
      await ClubSettings.updateOne({ key: 'club' }, { $set: { [`legal.${doc}`]: { body, version, approved, updatedAt: new Date() }, updatedBy: req.auth.user._id } }, { upsert: true });
      clearSettingsCache();
      await audit(req, { action: 'settings.legal_updated', entityType: 'ClubSettings', entityId: doc, metadata: { doc, from: before.version, to: version, approved } });
      res.json({ data: { doc, version, approved } });
    },
  );

  return { pub, admin };
}
