import {
  Activity,
  Bell,
  Binoculars,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  History,
  Images,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  Megaphone,
  MessageSquare,
  Newspaper,
  Server,
  Settings,
  Shield,
  Shirt,
  Trophy,
  UserCog,
  Users,
  Video,
} from 'lucide-react';

/**
 * Dashboard sections and the permissions that reveal them. This only decides what is
 * SHOWN; the API checks every permission again on each request.
 */
export const DASHBOARD_NAV = [
  { group: 'Overview', items: [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true, any: ['dashboard.view'] }] },
  {
    group: 'People',
    items: [
      { to: '/dashboard/applications', label: 'Applications', icon: ClipboardCheck, any: ['applications.players.review', 'applications.staff.review'] },
      { to: '/dashboard/users', label: 'Users', icon: Users, any: ['users.view', 'users.manage'] },
      { to: '/dashboard/staff', label: 'Staff', icon: UserCog, any: ['staff.view', 'staff.manage', 'staff.profiles.manage'] },
      { to: '/dashboard/players', label: 'Players', icon: Shirt, any: ['players.view', 'players.edit'] },
    ],
  },
  {
    group: 'Football',
    items: [
      { to: '/dashboard/teams', label: 'Teams', icon: Shield, any: ['teams.manage'] },
      { to: '/dashboard/competitions', label: 'Competitions', icon: Trophy, any: ['competitions.manage'] },
      { to: '/dashboard/seasons', label: 'Seasons', icon: CalendarDays, any: ['competitions.manage'] },
      { to: '/dashboard/matches', label: 'Fixtures & results', icon: Activity, any: ['matches.manage', 'matches.report'] },
      { to: '/dashboard/standings', label: 'Standings', icon: ListOrdered, any: ['standings.override', 'competitions.manage'] },
    ],
  },
  {
    group: 'Content',
    items: [
      { to: '/dashboard/news', label: 'News', icon: Newspaper, any: ['news.create', 'news.edit', 'news.publish', 'news.delete'] },
      { to: '/dashboard/videos', label: 'Videos', icon: Video, any: ['media.manage'] },
      { to: '/dashboard/gallery', label: 'Gallery', icon: Images, any: ['media.manage'] },
      { to: '/dashboard/comments', label: 'Comments', icon: MessageSquare, any: ['comments.moderate'] },
      { to: '/dashboard/announcements', label: 'Announcements', icon: Megaphone, any: ['announcements.send'] },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/dashboard/reports', label: 'Reports', icon: ClipboardList, any: ['reports.view', 'reports.create'] },
      { to: '/dashboard/scouting', label: 'Scouting', icon: Binoculars, any: ['scouting.view'] },
      { to: '/dashboard/contact', label: 'Messages', icon: Inbox, any: ['contact.view'] },
      { to: '/dashboard/notifications', label: 'My notifications', icon: Bell, any: ['dashboard.view'] },
      { to: '/dashboard/audit', label: 'Audit log', icon: History, any: ['audit.view'] },
      { to: '/dashboard/settings', label: 'Club settings', icon: Settings, any: ['settings.manage'] },
      { to: '/dashboard/system', label: 'System', icon: Server, any: ['system.view'] },
    ],
  },
];

