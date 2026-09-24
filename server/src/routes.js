import { Router } from 'express';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAccountRouter } from './modules/account/account.routes.js';
import { createSettingsRouters } from './modules/settings/settings.routes.js';
import { createSeasonRouters } from './modules/football/seasons.routes.js';
import { createTeamRouters } from './modules/football/teams.routes.js';
import { createCompetitionRouters } from './modules/football/competitions.routes.js';
import { createMatchRouters } from './modules/football/matches.routes.js';
import { createPlayerRouters } from './modules/players/players.routes.js';
import { createStaffRouters } from './modules/staff/staff.routes.js';
import { createApplicationsRouter } from './modules/applications/applications.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';
import { createNewsRouters } from './modules/news/news.routes.js';
import { createMediaRouters } from './modules/media/media.routes.js';
import { createCommentRouters } from './modules/comments/comments.routes.js';
import { createNotificationRouters } from './modules/notifications/notifications.routes.js';
import { createReportsRouter } from './modules/reports/reports.routes.js';
import { createScoutingRouter } from './modules/scouting/scouting.routes.js';
import { createContactRouters } from './modules/contact/contact.routes.js';
import { createSearchRouters } from './modules/search/search.routes.js';
import { createAuditRouter } from './modules/audit/audit.routes.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { createPortalRouter } from './modules/portal/portal.routes.js';
import { createSitemapRouter } from './modules/sitemap.routes.js';

/**
 * Public, account, portal and staff (/admin) routes. Every /admin route checks
 * authentication, account status, staff status and permission on the server.
 */
export function mountRoutes(api, ctx) {
  const settings = createSettingsRouters(ctx);
  const seasons = createSeasonRouters(ctx);
  const teams = createTeamRouters(ctx);
  const competitions = createCompetitionRouters(ctx);
  const matches = createMatchRouters(ctx);
  const players = createPlayerRouters(ctx);
  const staff = createStaffRouters(ctx);
  const news = createNewsRouters(ctx);
  const media = createMediaRouters(ctx);
  const comments = createCommentRouters(ctx);
  const notifications = createNotificationRouters(ctx);
  const contact = createContactRouters(ctx);
  const search = createSearchRouters(ctx);

  // ---- Public & signed-in user --------------------------------------------------------
  api.use('/auth', createAuthRouter(ctx));
  api.use('/account', createAccountRouter(ctx));
  api.use('/', settings.pub);
  api.use('/', contact.pub);
  api.use('/', createSitemapRouter(ctx));
  api.use('/seasons', seasons.pub);
  api.use('/teams', teams.pub);
  api.use('/competitions', competitions.pub);
  api.use('/matches', matches.pub);
  api.use('/players', players.pub);
  api.use('/staff', staff.pub);
  api.use('/news', news.pub);
  api.use('/videos', media.videosPub);
  api.use('/gallery', media.galleryPub);
  api.use('/comments', comments.pub);
  api.use('/search', search.pub);
  api.use('/notifications', notifications.mine);
  api.use('/media', media.uploads);
  api.use('/portal', createPortalRouter(ctx));

  // ---- Staff dashboard ----------------------------------------------------------------
  const admin = Router();
  admin.use('/dashboard', createDashboardRouter(ctx));
  admin.use('/seasons', seasons.admin);
  admin.use('/teams', teams.admin);
  admin.use('/competitions', competitions.admin);
  admin.use('/matches', matches.admin);
  admin.use('/players', players.admin);
  admin.use('/staff', staff.admin);
  admin.use('/applications', createApplicationsRouter(ctx));
  admin.use('/users', createUsersRouter(ctx));
  admin.use('/news', news.admin);
  admin.use('/videos', media.videosAdmin);
  admin.use('/gallery', media.galleryAdmin);
  admin.use('/comments', comments.admin);
  admin.use('/announcements', notifications.admin);
  admin.use('/reports', createReportsRouter(ctx));
  admin.use('/scouting', createScoutingRouter(ctx));
  admin.use('/contact', contact.admin);
  admin.use('/settings', settings.admin);
  admin.use('/search', search.admin);
  admin.use('/audit', createAuditRouter(ctx));
  api.use('/admin', admin);
}
