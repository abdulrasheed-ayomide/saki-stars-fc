import { NavLink, Outlet } from 'react-router';
import { Bell, CalendarDays, FileText, Home, Megaphone, BarChart3, UserRound, Users } from 'lucide-react';
import { Container } from '../../components/layout/Container.jsx';

const LINKS = [
  { to: '/portal', label: 'Dashboard', icon: Home, end: true },
  { to: '/portal/profile', label: 'My profile', icon: UserRound },
  { to: '/portal/team', label: 'My team', icon: Users },
  { to: '/portal/matches', label: 'Matches', icon: CalendarDays },
  { to: '/portal/stats', label: 'Statistics', icon: BarChart3 },
  { to: '/portal/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/portal/notifications', label: 'Notifications', icon: Bell },
  { to: '/portal/documents', label: 'Documents', icon: FileText },
];

export default function PortalLayout() {
  return (
    <div className="bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <Container className="py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">Player Portal</p>
          <nav aria-label="Player Portal" className="-mx-2 mt-2 relative overflow-x-auto px-2">
            <ul className="flex min-w-max gap-1">
              {LINKS.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium ${isActive ? 'bg-brand-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </div>
      <Container className="py-8">
        <Outlet />
      </Container>
    </div>
  );
}
