import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Bell, ExternalLink, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { useUnreadCount } from '../../hooks/useUnreadCount.js';
import { AccountMenu } from '../../components/layout/AccountMenu.jsx';
import { ServerStatusNotice } from '../../components/feedback/ServerStatusNotice.jsx';
import { PageSpinner } from '../../components/ui/Spinner.jsx';
import { DASHBOARD_NAV } from './nav.js';
import { initials } from '../../lib/format.js';

function SideNav({ onNavigate }) {
  const { can } = useAuth();
  return (
    <nav aria-label="Dashboard" className="space-y-5 px-3 py-4">
      {DASHBOARD_NAV.map((group) => {
        const items = group.items.filter((i) => can(...i.any));
        if (!items.length) return null;
        return (
          <div key={group.group}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{group.group}</p>
            <ul className="mt-1 space-y-0.5">
              {items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) => `flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium ${isActive ? 'bg-white text-brand-900' : 'text-brand-100 hover:bg-white/10 hover:text-white'}`}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  const { settings } = useSettings();
  return (
    <Link to="/dashboard" className="flex min-h-11 min-w-0 items-center gap-2 text-white">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-white/80 text-[11px] font-bold">
        {initials(settings.shortName)}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold">Club Management</span>
    </Link>
  );
}

/** Staff dashboard shell: sidebar on large screens, slide-in drawer on phones and tablets. */
export default function DashboardLayout() {
  const [drawer, setDrawer] = useState(false);
  const { user } = useAuth();
  const unread = useUnreadCount();
  const location = useLocation();
  const menuButton = useRef(null);
  const panel = useRef(null);

  const close = useCallback(() => {
    setDrawer(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  }, []);

  useEffect(() => {
    if (!drawer) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('a,button')?.focus();
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [drawer, close]);

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <a href="#dashboard-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-brand-900 focus:shadow-lg">
        Skip to main content
      </a>
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-950 lg:flex">
        <div className="sticky top-0 flex max-h-dvh flex-col overflow-y-auto">
          <div className="border-b border-white/10 px-4 py-3">
            <Brand />
          </div>
          <SideNav />
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboard menu">
          <div className="absolute inset-0 bg-slate-950/50" onClick={close} aria-hidden="true" />
          <div ref={panel} className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-brand-950">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <Brand />
              <button type="button" onClick={close} aria-label="Close menu" className="grid size-11 shrink-0 place-items-center rounded-md text-white hover:bg-white/10">
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <SideNav onNavigate={close} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 bg-brand-900 text-white shadow-sm">
          <div className="flex min-h-14 items-center justify-between gap-2 px-2 xs:px-4">
            <div className="flex min-w-0 items-center gap-1">
              <button ref={menuButton} type="button" onClick={() => setDrawer(true)} aria-label="Open dashboard menu" aria-expanded={drawer} className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-white/10 lg:hidden">
                <Menu aria-hidden="true" className="size-6" />
              </button>
              <p className="hidden min-w-0 truncate text-sm text-brand-100 sm:block">
                {user.staff?.roleLabel} · {user.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Link to="/dashboard/search" aria-label="Search the dashboard" className="grid size-11 place-items-center rounded-md hover:bg-white/10">
                <Search aria-hidden="true" className="size-5" />
              </Link>
              <Link to="/dashboard/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative grid size-11 place-items-center rounded-md hover:bg-white/10">
                <Bell aria-hidden="true" className="size-5" />
                {unread > 0 && <span className="absolute right-1 top-1 min-w-5 rounded-full bg-amber-400 px-1 text-center text-[11px] font-bold leading-5 text-brand-950">{unread > 99 ? '99+' : unread}</span>}
              </Link>
              <Link to="/" aria-label="Open the public website" className="grid size-11 place-items-center rounded-md hover:bg-white/10">
                <ExternalLink aria-hidden="true" className="size-5" />
              </Link>
              <AccountMenu />
            </div>
          </div>
        </header>
        <ServerStatusNotice />
        <main id="dashboard-main" tabIndex={-1} className="min-w-0 flex-1 px-2 py-6 focus:outline-none xs:px-4 sm:px-6 lg:px-8" key={location.pathname.split('/')[2] || 'home'}>
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
}
