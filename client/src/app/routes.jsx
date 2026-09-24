import { lazy } from 'react';
import { PublicLayout } from '../layouts/PublicLayout.jsx';
import RouteErrorPage from '../pages/RouteErrorPage.jsx';
// Static because the error page also needs it; it is tiny.
import NotFoundPage from '../pages/NotFoundPage.jsx';
import { RequireAuth, RequirePermission, RequirePlayer, RequireStaff } from '../auth/guards.jsx';

// Route-level code splitting: each area downloads only when visited.
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));

const HomePage = lazy(() => import('../pages/HomePage.jsx'));
const ClubPage = lazy(() => import('../pages/public/ClubPage.jsx'));
const TeamsPage = lazy(() => import('../pages/public/TeamsPage.jsx'));
const TeamDetailPage = lazy(() => import('../pages/public/TeamDetailPage.jsx'));
const PlayersPage = lazy(() => import('../pages/public/PlayersPage.jsx'));
const PlayerDetailPage = lazy(() => import('../pages/public/PlayerDetailPage.jsx'));
const FixturesResultsPage = lazy(() => import('../pages/public/FixturesResultsPage.jsx'));
const MatchCentrePage = lazy(() => import('../pages/public/MatchCentrePage.jsx'));
const CompetitionsPage = lazy(() => import('../pages/public/CompetitionsPage.jsx'));
const CompetitionDetailPage = lazy(() => import('../pages/public/CompetitionDetailPage.jsx'));
const NewsPage = lazy(() => import('../pages/public/NewsPage.jsx'));
const NewsArticlePage = lazy(() => import('../pages/public/NewsArticlePage.jsx'));
const VideosPage = lazy(() => import('../pages/public/VideosPage.jsx'));
const GalleryPage = lazy(() => import('../pages/public/GalleryPage.jsx'));
const StaffPage = lazy(() => import('../pages/public/StaffPage.jsx'));
const ContactPage = lazy(() => import('../pages/public/ContactPage.jsx'));
const SearchPage = lazy(() => import('../pages/public/SearchPage.jsx'));
const LegalPage = lazy(() => import('../pages/public/LegalPage.jsx'));
const NewsletterPage = lazy(() => import('../pages/public/NewsletterPage.jsx'));

const LoginPage = lazy(() => import('../pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage.jsx'));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage.jsx'));
const VerifyEmailPage = lazy(() => import('../pages/auth/VerifyEmailPage.jsx'));

const AccountLayout = lazy(() => import('../pages/account/AccountLayout.jsx'));
const ProfilePage = lazy(() => import('../pages/account/ProfilePage.jsx'));
const ApplicationsPage = lazy(() => import('../pages/account/ApplicationsPage.jsx'));
const NotificationsPage = lazy(() => import('../pages/account/NotificationsPage.jsx'));
const SecurityPage = lazy(() => import('../pages/account/SecurityPage.jsx'));
const PrivacyPage = lazy(() => import('../pages/account/PrivacyPage.jsx'));

const PortalLayout = lazy(() => import('../pages/portal/PortalLayout.jsx'));
const portal = () => import('../pages/portal/PortalPages.jsx');
const PortalHome = named(portal, 'PortalHome');
const PortalProfile = named(portal, 'PortalProfile');
const PortalTeam = named(portal, 'PortalTeam');
const PortalMatches = named(portal, 'PortalMatches');
const PortalStats = named(portal, 'PortalStats');
const PortalAnnouncements = named(portal, 'PortalAnnouncements');
const PortalNotifications = named(portal, 'PortalNotifications');
const PortalDocuments = named(portal, 'PortalDocuments');

const DashboardLayout = lazy(() => import('../pages/dashboard/DashboardLayout.jsx'));
const OverviewPage = lazy(() => import('../pages/dashboard/OverviewPage.jsx'));
const apps = () => import('../pages/dashboard/ApplicationsPage.jsx');
const AdminApplications = lazy(apps);
const ApplicationDetailPage = named(apps, 'ApplicationDetailPage');
const users = () => import('../pages/dashboard/UsersPages.jsx');
const UsersListPage = named(users, 'UsersListPage');
const UserDetailPage = named(users, 'UserDetailPage');
const staff = () => import('../pages/dashboard/StaffPages.jsx');
const StaffListPage = named(staff, 'StaffListPage');
const StaffDetailPage = named(staff, 'StaffDetailPage');
const players = () => import('../pages/dashboard/PlayersPages.jsx');
const PlayersListPage = named(players, 'PlayersListPage');
const PlayerEditPage = named(players, 'PlayerEditPage');
const football = () => import('../pages/dashboard/FootballPages.jsx');
const TeamsAdminPage = named(football, 'TeamsAdminPage');
const SeasonsAdminPage = named(football, 'SeasonsAdminPage');
const CompetitionsAdminPage = named(football, 'CompetitionsAdminPage');
const StandingsAdminPage = named(football, 'StandingsAdminPage');
const matches = () => import('../pages/dashboard/MatchesPages.jsx');
const MatchesListPage = named(matches, 'MatchesListPage');
const MatchEditPage = named(matches, 'MatchEditPage');
const content = () => import('../pages/dashboard/ContentPages.jsx');
const NewsListPage = named(content, 'NewsListPage');
const NewsEditorPage = named(content, 'NewsEditorPage');
const VideosAdminPage = named(content, 'VideosAdminPage');
const GalleryAdminPage = named(content, 'GalleryAdminPage');
const CommentsAdminPage = named(content, 'CommentsAdminPage');
const AnnouncementsAdminPage = named(content, 'AnnouncementsAdminPage');
const ops = () => import('../pages/dashboard/OperationsPages.jsx');
const ReportsListPage = named(ops, 'ReportsListPage');
const ReportDetailPage = named(ops, 'ReportDetailPage');
const ScoutingPage = named(ops, 'ScoutingPage');
const ScoutingReportPage = named(ops, 'ScoutingReportPage');
const ContactAdminPage = named(ops, 'ContactAdminPage');
const AuditPage = named(ops, 'AuditPage');
const SystemPage = named(ops, 'SystemPage');
const DashboardNotificationsPage = named(ops, 'DashboardNotificationsPage');
const DashboardSearchPage = named(ops, 'DashboardSearchPage');
const SettingsPage = lazy(() => import('../pages/dashboard/SettingsPage.jsx'));

/** Wraps a dashboard page so it explains itself when the role lacks the permission. */
const guard = (anyOf, element) => <RequirePermission anyOf={anyOf}>{element}</RequirePermission>;

export const routes = [
  {
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'club', element: <ClubPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'teams/:id', element: <TeamDetailPage /> },
      { path: 'players', element: <PlayersPage /> },
      { path: 'players/:id', element: <PlayerDetailPage /> },
      { path: 'fixtures-results', element: <FixturesResultsPage /> },
      { path: 'matches/:id', element: <MatchCentrePage /> },
      { path: 'competitions', element: <CompetitionsPage /> },
      { path: 'competitions/:id', element: <CompetitionDetailPage /> },
      { path: 'news', element: <NewsPage /> },
      { path: 'news/:slug', element: <NewsArticlePage /> },
      { path: 'videos', element: <VideosPage /> },
      { path: 'gallery', element: <GalleryPage /> },
      { path: 'staff', element: <StaffPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'terms', element: <LegalPage doc="terms" /> },
      { path: 'privacy', element: <LegalPage doc="privacy" /> },
      { path: 'cookie-policy', element: <LegalPage doc="cookies" /> },
      { path: 'newsletter/confirm', element: <NewsletterPage action="confirm" /> },
      { path: 'newsletter/unsubscribe', element: <NewsletterPage action="unsubscribe" /> },

      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },

      {
        path: 'account',
        element: (
          <RequireAuth>
            <AccountLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <ProfilePage /> },
          { path: 'applications', element: <ApplicationsPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'security', element: <SecurityPage /> },
          { path: 'privacy', element: <PrivacyPage /> },
        ],
      },
      {
        path: 'portal',
        element: (
          <RequirePlayer>
            <PortalLayout />
          </RequirePlayer>
        ),
        children: [
          { index: true, element: <PortalHome /> },
          { path: 'profile', element: <PortalProfile /> },
          { path: 'team', element: <PortalTeam /> },
          { path: 'matches', element: <PortalMatches /> },
          { path: 'stats', element: <PortalStats /> },
          { path: 'announcements', element: <PortalAnnouncements /> },
          { path: 'notifications', element: <PortalNotifications /> },
          { path: 'documents', element: <PortalDocuments /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: 'dashboard',
    element: (
      <RequireStaff>
        <DashboardLayout />
      </RequireStaff>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'applications', element: guard(['applications.players.review', 'applications.staff.review'], <AdminApplications />) },
      { path: 'applications/:kind/:id', element: guard(['applications.players.review', 'applications.staff.review'], <ApplicationDetailPage />) },
      { path: 'users', element: guard(['users.view', 'users.manage'], <UsersListPage />) },
      { path: 'users/:id', element: guard(['users.view', 'users.manage'], <UserDetailPage />) },
      { path: 'staff', element: guard(['staff.view', 'staff.manage', 'staff.profiles.manage'], <StaffListPage />) },
      { path: 'staff/:id', element: guard(['staff.view', 'staff.manage', 'staff.profiles.manage'], <StaffDetailPage />) },
      { path: 'players', element: guard(['players.view', 'players.edit'], <PlayersListPage />) },
      { path: 'players/new', element: guard(['players.create'], <PlayerEditPage />) },
      { path: 'players/:id', element: guard(['players.view', 'players.edit'], <PlayerEditPage />) },
      { path: 'teams', element: guard(['teams.manage'], <TeamsAdminPage />) },
      { path: 'competitions', element: guard(['competitions.manage'], <CompetitionsAdminPage />) },
      { path: 'seasons', element: guard(['competitions.manage'], <SeasonsAdminPage />) },
      { path: 'standings', element: guard(['standings.override', 'competitions.manage'], <StandingsAdminPage />) },
      { path: 'matches', element: guard(['matches.manage', 'matches.report'], <MatchesListPage />) },
      { path: 'matches/new', element: guard(['matches.manage'], <MatchEditPage />) },
      { path: 'matches/:id', element: guard(['matches.manage', 'matches.report'], <MatchEditPage />) },
      { path: 'news', element: guard(['news.create', 'news.edit', 'news.publish', 'news.delete'], <NewsListPage />) },
      { path: 'news/new', element: guard(['news.create', 'news.edit'], <NewsEditorPage />) },
      { path: 'news/:id', element: guard(['news.create', 'news.edit', 'news.publish', 'news.delete'], <NewsEditorPage />) },
      { path: 'videos', element: guard(['media.manage'], <VideosAdminPage />) },
      { path: 'gallery', element: guard(['media.manage'], <GalleryAdminPage />) },
      { path: 'comments', element: guard(['comments.moderate'], <CommentsAdminPage />) },
      { path: 'announcements', element: guard(['announcements.send'], <AnnouncementsAdminPage />) },
      { path: 'reports', element: guard(['reports.view', 'reports.create'], <ReportsListPage />) },
      { path: 'reports/:id', element: guard(['reports.view', 'reports.create'], <ReportDetailPage />) },
      { path: 'scouting', element: guard(['scouting.view'], <ScoutingPage />) },
      { path: 'scouting/reports/new', element: guard(['scouting.manage'], <ScoutingReportPage />) },
      { path: 'scouting/reports/:id', element: guard(['scouting.view'], <ScoutingReportPage />) },
      { path: 'contact', element: guard(['contact.view'], <ContactAdminPage />) },
      { path: 'audit', element: guard(['audit.view'], <AuditPage />) },
      { path: 'settings', element: guard(['settings.manage'], <SettingsPage />) },
      { path: 'system', element: guard(['system.view'], <SystemPage />) },
      { path: 'notifications', element: <DashboardNotificationsPage /> },
      { path: 'search', element: <DashboardSearchPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
