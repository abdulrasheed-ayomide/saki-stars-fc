import { Navigate, Outlet, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthProvider.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { StatusMessage } from '../components/feedback/StatusMessage.jsx';

function toLogin(location) {
  const next = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`/login?next=${next}`} replace />;
}

export function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageSpinner label="Checking your session…" />;
  if (status !== 'authenticated') return toLogin(location);
  return children ?? <Outlet />;
}

function Forbidden({ title, text }) {
  return (
    <StatusMessage icon={ShieldAlert} eyebrow="Access restricted" title={title}>
      <p>{text}</p>
    </StatusMessage>
  );
}

export function RequirePlayer({ children }) {
  const { status, isPlayer } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageSpinner label="Checking your session…" />;
  if (status !== 'authenticated') return toLogin(location);
  if (!isPlayer) return <Forbidden title="Player Portal" text="The Player Portal is for registered club players. You can apply to become a player from your account page." />;
  return children ?? <Outlet />;
}

export function RequireStaff({ children }) {
  const { status, isStaff, can } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageSpinner label="Checking your session…" />;
  if (status !== 'authenticated') return toLogin(location);
  if (!isStaff || !can('dashboard.view')) return <Forbidden title="Staff only" text="This area is for club staff. If you should have access, ask the Club Director." />;
  return children ?? <Outlet />;
}

/** Hides a dashboard page (and explains why) when the permission is missing. */
export function RequirePermission({ anyOf, children }) {
  const { can } = useAuth();
  if (!can(...anyOf)) return <Forbidden title="No access to this section" text="Your role does not include this section. Ask the Club Director if you need it." />;
  return children ?? <Outlet />;
}
