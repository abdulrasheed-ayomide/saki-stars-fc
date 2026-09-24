import { NavLink, Outlet } from 'react-router';
import { Bell, ClipboardList, KeyRound, Scale, UserRound } from 'lucide-react';
import { Container } from '../../components/layout/Container.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { Link } from 'react-router';

const LINKS = [
  { to: '/account', label: 'Profile', icon: UserRound, end: true },
  { to: '/account/applications', label: 'Applications', icon: ClipboardList },
  { to: '/account/notifications', label: 'Notifications', icon: Bell },
  { to: '/account/security', label: 'Security', icon: KeyRound },
  { to: '/account/privacy', label: 'Privacy & data', icon: Scale },
];

export default function AccountLayout() {
  const { user } = useAuth();
  return (
    <Container className="py-8">
      {!user.emailVerified && (
        <Alert tone="warning" className="mb-6" title="Please confirm your email address">
          We sent a link to {user.email}. Until you confirm it you cannot comment or apply to join the club.{' '}
          <Link to={`/verify-email?email=${encodeURIComponent(user.email)}`} className="font-semibold underline">
            Send a new link
          </Link>
        </Alert>
      )}
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Account" className="md:sticky md:top-20 md:self-start">
          <ul className="-mx-2 flex gap-1 relative overflow-x-auto px-2 md:mx-0 md:flex-col md:px-0">
            {LINKS.map(({ to, label, icon: Icon, end }) => (
              <li key={to} className="shrink-0">
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
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </Container>
  );
}
