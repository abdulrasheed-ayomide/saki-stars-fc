import { Router } from 'express';
import { z } from 'zod';
import { Player, Match, Staff, Notification, Announcement, Season } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { objectId } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { ownPlayer, publicPlayer, publicTeam, matchSummary, publicStaff } from '../../serializers/index.js';
import { playerStats, withAdjustments, teamRecord } from '../../services/stats.service.js';
import { MATCH_POPULATE } from '../football/teams.routes.js';
import { currentSeason } from '../football/seasons.routes.js';

const TEAM_POP = { path: 'team', select: 'name shortName slug logo isClubTeam description category ageGroup homeVenue' };

function completion(p) {
  const r = p.restricted || {};
  const checks = [
    { key: 'phone', label: 'Phone number', done: Boolean(r.phone) },
    { key: 'address', label: 'Home address', done: Boolean(r.address) },
    { key: 'dateOfBirth', label: 'Date of birth', done: Boolean(r.dateOfBirth) },
    { key: 'emergencyContact', label: 'Emergency contact', done: Boolean(r.emergencyContact?.name && r.emergencyContact?.phone) },
    { key: 'photo', label: 'Profile photo (added by the club)', done: Boolean(p.photo) },
  ];
  if (p.isMinor) {
    checks.push({ key: 'guardian', label: 'Parent/guardian details', done: Boolean(r.guardian?.name && r.guardian?.phone) });
    checks.push({ key: 'consentForm', label: 'Signed consent form uploaded', done: (r.documents || []).some((d) => d.kind === 'consent') });
  }
  const done = checks.filter((c) => c.done).length;
  return { percent: Math.round((done / checks.length) * 100), items: checks };
}

/** The Player Portal: a player's own data only. Official football data is read-only here. */
export function createPortalRouter({ auth, audit, media, upload, limiters }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requirePlayer);

  async function loadOwn(req) {
    const player = await Player.findOne({ _id: req.auth.user.player, deletedAt: null }).populate(TEAM_POP);
    if (!player) throw AppError.notFound('Your player profile is not available. Contact the club.');
    return player;
  }

  function teamMatchFilter(teamId) {
    return { deletedAt: null, $or: [{ homeTeam: teamId }, { awayTeam: teamId }] };
  }

  router.get('/overview', async (req, res) => {
    const player = (await loadOwn(req)).toObject();
    const season = await currentSeason();
    const teamId = player.team?._id;
    const [nextMatches, recent, seasonStats, unread, announcements] = await Promise.all([
      teamId
        ? Match.find({ ...teamMatchFilter(teamId), status: { $in: ['scheduled', 'postponed', 'live'] }, kickoffAt: { $gte: new Date(Date.now() - 3 * 3600 * 1000) } })
            .sort({ kickoffAt: 1 })
            .limit(3)
            .populate(MATCH_POPULATE)
            .lean()
        : [],
      teamId ? Match.find({ ...teamMatchFilter(teamId), status: 'completed' }).sort({ kickoffAt: -1 }).limit(3).populate(MATCH_POPULATE).lean() : [],
      season ? playerStats([player._id], { season: season._id }) : null,
      Notification.countDocuments({ recipient: req.auth.user._id, readAt: null }),
      Announcement.find({
        createdAt: { $gte: req.auth.user.createdAt },
        $or: [{ audience: { $in: ['everyone', 'players'] } }, ...(teamId ? [{ audience: 'team', team: teamId }] : [])],
      })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean(),
    ]);
    res.json({
      data: {
        player: ownPlayer(player),
        team: player.team ? publicTeam(player.team) : null,
        nextMatches: nextMatches.map(matchSummary),
        recentResults: recent.map(matchSummary),
        season: season ? { id: idString(season._id), name: season.name } : null,
        seasonStats: seasonStats ? seasonStats.get(idString(player._id)) : null,
        unreadNotifications: unread,
        announcements: announcements.map((a) => ({ id: idString(a._id), title: a.title, body: a.body, createdAt: a.createdAt })),
        profileCompletion: completion(player),
      },
    });
  });

  router.get('/profile', async (req, res) => {
    const player = (await loadOwn(req)).toObject();
    res.json({ data: { ...ownPlayer(player), profileCompletion: completion(player) } });
  });

  // Players may update their own contact details. Team, position, number and stats are staff-controlled.
  const personalSchema = z.object({
    phone: z.string().trim().max(40).regex(/^[+0-9 ()-]*$/, 'Use digits, spaces, +, - and brackets only.').optional(),
    email: z.string().trim().max(254).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email.').optional(),
    address: z.string().trim().max(400).optional(),
    emergencyContact: z
      .object({ name: z.string().trim().max(120), relationship: z.string().trim().max(60), phone: z.string().trim().max(40).regex(/^[+0-9 ()-]*$/, 'Use digits only.') })
      .partial()
      .optional(),
    guardian: z.object({ phone: z.string().trim().max(40).regex(/^[+0-9 ()-]*$/, 'Use digits only.'), email: z.string().trim().max(254) }).partial().optional(),
    dateOfBirth: z.coerce.date().optional(),
  });

  router.patch('/personal', validate({ body: personalSchema }), async (req, res) => {
    const player = await loadOwn(req);
    const body = req.valid.body;
    const r = player.restricted;
    for (const key of ['phone', 'email', 'address']) if (body[key] !== undefined) r[key] = body[key];
    if (body.emergencyContact) r.emergencyContact = { ...(r.emergencyContact?.toObject?.() ?? r.emergencyContact ?? {}), ...body.emergencyContact };
    if (body.guardian) r.guardian = { ...(r.guardian?.toObject?.() ?? r.guardian ?? {}), ...body.guardian };
    // Date of birth can be added once; corrections go through the club (it affects youth eligibility).
    if (body.dateOfBirth) {
      if (r.dateOfBirth && r.dateOfBirth.getTime() !== body.dateOfBirth.getTime()) {
        throw AppError.validation([{ path: 'dateOfBirth', message: 'Your date of birth is already on file. Ask the club to correct it.' }]);
      }
      r.dateOfBirth = body.dateOfBirth;
    }
    await player.save();
    await audit(req, { action: 'player.personal_updated_by_self', entityType: 'Player', entityId: player._id, metadata: { fields: Object.keys(body) } });
    const fresh = player.toObject();
    res.json({ data: { ...ownPlayer(fresh), profileCompletion: completion(fresh) } });
  });

  router.get('/team', async (req, res) => {
    const player = (await loadOwn(req)).toObject();
    if (!player.team) return res.json({ data: null });
    const season = await currentSeason();
    const [squad, staff, record] = await Promise.all([
      Player.find({ team: player.team._id, deletedAt: null, status: { $nin: ['released', 'archived'] } })
        .populate('team', 'name shortName slug logo isClubTeam')
        .sort({ jerseyNumber: 1, lastName: 1 })
        .lean(),
      Staff.find({ status: 'active', $or: [{ team: player.team._id }, { assignedTeams: player.team._id }] }).lean(),
      teamRecord(player.team._id, { season: season?._id }),
    ]);
    res.json({
      data: {
        team: publicTeam(player.team),
        // Teammates see each other's public profile only.
        squad: squad.map((p) => publicPlayer(p)),
        staff: staff.map(publicStaff),
        record: { season: season ? { id: idString(season._id), name: season.name } : null, ...record },
      },
    });
  });

  router.get('/matches', validate({ query: z.object({ type: z.enum(['upcoming', 'results']).optional().default('upcoming') }) }), async (req, res) => {
    const player = (await loadOwn(req)).toObject();
    if (!player.team) return res.json({ data: [] });
    const upcoming = req.valid.query.type === 'upcoming';
    const matches = await Match.find({
      ...teamMatchFilter(player.team._id),
      status: upcoming ? { $in: ['scheduled', 'postponed', 'live'] } : { $in: ['completed', 'abandoned'] },
      ...(upcoming ? { kickoffAt: { $gte: new Date(Date.now() - 3 * 3600 * 1000) } } : {}),
    })
      .sort({ kickoffAt: upcoming ? 1 : -1 })
      .limit(50)
      .populate(MATCH_POPULATE)
      .lean();
    const mine = new Set(
      matches
        .filter((m) => [...(m.lineups?.home || []), ...(m.lineups?.away || [])].some((l) => idString(l.player) === idString(player._id)))
        .map((m) => idString(m._id)),
    );
    res.json({ data: matches.map((m) => ({ ...matchSummary(m), played: mine.has(idString(m._id)) })) });
  });

  router.get('/stats', async (req, res) => {
    const player = (await loadOwn(req)).toObject();
    const seasons = await Season.find().sort({ startDate: -1 }).lean();
    const perSeason = [];
    for (const s of seasons) {
      const st = (await playerStats([player._id], { season: s._id })).get(idString(player._id));
      if (st.appearances || st.goals || st.assists) perSeason.push({ season: { id: idString(s._id), name: s.name }, ...st });
    }
    const career = withAdjustments((await playerStats([player._id])).get(idString(player._id)), player);
    res.json({ data: { career, seasons: perSeason } });
  });

  // ---- Documents / forms the club requires ---------------------------------------------
  router.post(
    '/documents',
    limiters.uploads,
    upload,
    validate({ body: z.object({ name: z.string().trim().min(2).max(150), kind: z.enum(['consent', 'registration', 'id', 'medical', 'other']).optional().default('other') }) }),
    async (req, res) => {
      const player = await loadOwn(req);
      const file = await media.upload(req.file, { kind: 'document', folder: 'documents', isPrivate: true });
      player.restricted.documents.push({ name: req.valid.body.name, kind: req.valid.body.kind, file, uploadedBy: req.auth.user._id });
      await player.save();
      const doc = player.restricted.documents.at(-1);
      await audit(req, { action: 'player.document_uploaded_by_self', entityType: 'Player', entityId: player._id, metadata: { kind: doc.kind } });
      res.status(201).json({ data: { id: idString(doc._id), name: doc.name, kind: doc.kind, uploadedAt: doc.uploadedAt } });
    },
  );

  router.get('/documents/:docId', validate({ params: z.object({ docId: objectId }) }), async (req, res) => {
    const player = (await loadOwn(req)).toObject();
    const doc = (player.restricted?.documents || []).find((d) => idString(d._id) === req.valid.params.docId);
    if (!doc) throw AppError.notFound('Document not found.');
    res.json({ data: { url: media.privateUrl(doc.file), expiresInSeconds: 300 } });
  });

  router.delete('/documents/:docId', validate({ params: z.object({ docId: objectId }) }), async (req, res) => {
    const player = await loadOwn(req);
    const doc = player.restricted.documents.id(req.valid.params.docId);
    if (!doc) throw AppError.notFound('Document not found.');
    if (idString(doc.uploadedBy) !== idString(req.auth.user._id)) throw AppError.forbidden('Documents added by the club can only be removed by the club.');
    const file = doc.file;
    doc.deleteOne();
    await player.save();
    await media.destroy(file);
    await audit(req, { action: 'player.document_deleted_by_self', entityType: 'Player', entityId: player._id });
    res.json({ data: { id: req.valid.params.docId } });
  });

  return router;
}
