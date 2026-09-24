import { Router } from 'express';
import mongoose from 'mongoose';
import {
  Player,
  Team,
  Match,
  News,
  PlayerApplication,
  StaffApplication,
  Report,
  AuditLog,
  User,
  Comment,
  ContactMessage,
  Staff,
  Video,
  GalleryItem,
} from '../../models/index.js';
import { matchSummary } from '../../serializers/index.js';
import { has, matchScopeFilter, playerScopeFilter, scopeOf } from '../../auth/access.js';
import { MATCH_POPULATE } from '../football/teams.routes.js';
import { getDatabaseState, supportsTransactions } from '../../db/connection.js';
import { idString } from '../../utils/ids.js';

/**
 * Overview numbers are real counts from the database, limited to what the person may see.
 * An empty database gives zeros and empty lists, never invented figures.
 */
export function createDashboardRouter({ auth, config, media, email }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('dashboard.view'));

  router.get('/overview', async (req, res) => {
    const a = req.auth;
    const out = { cards: {}, lists: {} };
    const jobs = [];
    const add = (fn) => jobs.push(fn());

    const playerPerm = scopeOf(a, 'players.view') ? 'players.view' : scopeOf(a, 'players.edit') ? 'players.edit' : null;
    if (playerPerm) add(async () => (out.cards.activePlayers = await Player.countDocuments({ deletedAt: null, status: 'active', ...playerScopeFilter(a, playerPerm) })));
    add(async () => (out.cards.teams = await Team.countDocuments({ isClubTeam: true, status: 'active' })));

    const matchFilter = has(a, 'matches.manage') ? matchScopeFilter(a, 'matches.manage') : {};
    add(async () => {
      const clubTeams = (await Team.find({ isClubTeam: true }).select('_id').lean()).map((t) => t._id);
      const involving = { $or: [{ homeTeam: { $in: clubTeams } }, { awayTeam: { $in: clubTeams } }] };
      const base = { deletedAt: null, ...(Object.keys(matchFilter).length ? { $and: [matchFilter, involving] } : involving) };
      const [upcoming, recent, awaitingResult] = await Promise.all([
        Match.find({ ...base, status: { $in: ['scheduled', 'postponed'] }, kickoffAt: { $gte: new Date() } }).sort({ kickoffAt: 1 }).limit(5).populate(MATCH_POPULATE).lean(),
        Match.find({ ...base, status: 'completed' }).sort({ kickoffAt: -1 }).limit(5).populate(MATCH_POPULATE).lean(),
        has(a, 'matches.manage') ? Match.countDocuments({ ...base, status: { $in: ['scheduled', 'live'] }, kickoffAt: { $lt: new Date(Date.now() - 2 * 3600 * 1000) } }) : null,
      ]);
      out.lists.upcomingFixtures = upcoming.map(matchSummary);
      out.lists.recentResults = recent.map(matchSummary);
      if (awaitingResult !== null) out.cards.resultsToRecord = awaitingResult;
    });

    if (has(a, 'applications.players.review')) add(async () => (out.cards.pendingPlayerApplications = await PlayerApplication.countDocuments({ status: 'pending' })));
    if (has(a, 'applications.staff.review')) add(async () => (out.cards.pendingStaffApplications = await StaffApplication.countDocuments({ status: 'pending' })));
    if (has(a, 'news.publish') || has(a, 'news.edit')) {
      add(async () => {
        out.cards.newsInReview = await News.countDocuments({ status: 'review', deletedAt: null });
        out.cards.newsDrafts = await News.countDocuments({ status: 'draft', deletedAt: null });
      });
    } else if (has(a, 'news.create')) {
      add(async () => (out.cards.myDrafts = await News.countDocuments({ status: 'draft', deletedAt: null, author: a.user._id })));
    }
    if (has(a, 'media.manage')) {
      add(async () => {
        out.cards.videos = await Video.countDocuments({ status: 'published', deletedAt: null });
        out.cards.galleryImages = await GalleryItem.countDocuments({ status: 'published', deletedAt: null });
      });
    }
    if (has(a, 'comments.moderate')) add(async () => (out.cards.commentsToModerate = await Comment.countDocuments({ deletedAt: null, status: { $in: ['pending', 'reported'] } })));
    if (has(a, 'contact.view')) add(async () => (out.cards.unreadMessages = await ContactMessage.countDocuments({ status: 'new' })));
    if (has(a, 'users.view') || has(a, 'users.manage')) {
      add(async () => {
        out.cards.users = await User.countDocuments({ deletedAt: null });
        out.cards.deletionRequests = await User.countDocuments({ deletionRequestedAt: { $ne: null }, deletedAt: null });
      });
    }
    if (has(a, 'staff.view') || has(a, 'staff.manage')) add(async () => (out.cards.activeStaff = await Staff.countDocuments({ status: 'active', user: { $ne: null } })));
    if (has(a, 'reports.review')) {
      add(async () => {
        const recent = await Report.find({ status: { $in: ['submitted', 'under_review'] } }).sort({ createdAt: -1 }).limit(5).lean();
        out.cards.reportsToReview = await Report.countDocuments({ status: { $in: ['submitted', 'under_review'] } });
        out.lists.recentReports = recent.map((r) => ({ id: idString(r._id), title: r.title, authorName: r.authorName, type: r.type, createdAt: r.createdAt }));
      });
    }
    if (has(a, 'audit.view')) {
      add(async () => {
        const recent = await AuditLog.find({ action: { $nin: ['access.denied', 'auth.login', 'auth.logout'] } }).sort({ createdAt: -1 }).limit(8).lean();
        out.lists.recentActivity = recent.map((r) => ({ id: idString(r._id), action: r.action, actorName: r.actorName, status: r.status, createdAt: r.createdAt }));
        out.cards.failedLogins24h = await AuditLog.countDocuments({ action: 'auth.login_failed', createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } });
      });
    }
    await Promise.all(jobs);
    res.json({ data: out });
  });

  // Technical status for the IT Manager. No secrets, only whether things are configured.
  router.get('/system', auth.requirePermission('system.view'), async (req, res) => {
    const db = mongoose.connection;
    let collections = [];
    try {
      const stats = await db.db.listCollections().toArray();
      collections = await Promise.all(stats.map(async (c) => ({ name: c.name, documents: await db.db.collection(c.name).estimatedDocumentCount() })));
      collections.sort((x, y) => x.name.localeCompare(y.name));
    } catch {
      collections = [];
    }
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [failedLogins, denied, reuse] = await Promise.all([
      AuditLog.countDocuments({ action: 'auth.login_failed', createdAt: { $gte: since } }),
      AuditLog.countDocuments({ status: 'denied', createdAt: { $gte: since } }),
      AuditLog.countDocuments({ action: 'auth.refresh_token_reuse', createdAt: { $gte: since } }),
    ]);
    res.json({
      data: {
        environment: config.nodeEnv,
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        database: { state: getDatabaseState(), name: db.name, transactions: supportsTransactions(), collections },
        integrations: {
          email: { transport: config.email.transport, configured: email.isEnabled && config.email.transport === 'resend', sender: config.email.from ? config.email.from.replace(/<.*>/, '').trim() || 'set' : 'not set' },
          cloudinary: { configured: media.enabled, folder: config.cloudinary.folder },
        },
        security: {
          accessTokenMinutes: config.auth.accessTokenTtlMinutes,
          refreshTokenDays: config.auth.refreshTokenTtlDays,
          cookieSecure: config.auth.cookieSecure,
          cookieSameSite: config.auth.cookieSameSite,
          corsOrigins: config.corsOrigins,
          // Lets the Director check TRUST_PROXY: this should be their own public IP address,
          // not a Vercel/Render address (otherwise every visitor shares one rate limit).
          trustProxy: config.trustProxy,
          yourIp: req.ip,
          forwardedHops: String(req.headers['x-forwarded-for'] || '').split(',').filter((x) => x.trim()).length,
          last24h: { failedLogins, deniedRequests: denied, tokenReuse: reuse },
        },
        backups: {
          note: 'MongoDB Atlas takes automated snapshots on paid tiers. On the free tier, run "npm run backup:export" regularly and store the file somewhere outside Atlas. See docs/OPERATIONS.md.',
        },
      },
    });
  });

  return router;
}
