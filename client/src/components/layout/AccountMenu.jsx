import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, LayoutDashboard, LogOut, Shirt, UserRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useUnreadCount } from '../../hooks/useUnreadCount.js';
import { initials } from '../../lib/format.js';

/** Signed-in user menu in the header: account, notifications, portal/dashboard, sign out. */
export function AccountMenu() {
  const { user, status, isPlayer, isStaff, can, logout } = useAuth();
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (status !== 'authenticated') {
    return (
      <Link to="/login" className="hidden min-h-11 items-center rounded-md px-3 text-sm font-semibold text-white hover:bg-white/10 sm:flex">
        Sign in
      </Link>
    );
  }

  const item = 'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-slate-800 hover:bg-slate-100';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.name}${unread ? `, ${unread} unread notifications` : ''}`}
        className="relative grid size-11 shrink-0 place-items-center rounded-md hover:bg-white/10"
      >
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-white text-xs font-bold text-brand-900">
          {initials(user.name)}
        </span>
        {unread > 0 && <span aria-hidden="true" className="absolute right-1 top-1 size-2.5 rounded-full bg-amber-400 ring-2 ring-brand-900" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-1 text-slate-900 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-slate-500">{user.email}</p>
          <Link role="menuitem" to="/account" className={item} onClick={() => setOpen(false)}>
            <UserRound aria-hidden="true" className="size-4" /> My account
          </Link>
          <Link role="menuitem" to="/account/notifications" className={item} onClick={() => setOpen(false)}>
            <Bell aria-hidden="true" className="size-4" /> Notifications
            {unread > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">{unread}</span>}
          </Link>
          {isPlayer && (
            <Link role="menuitem" to="/portal" className={item} onClick={() => setOpen(false)}>
              <Shirt aria-hidden="true" className="size-4" /> Player Portal
            </Link>
          )}
          {isStaff && can('dashboard.view') && (
            <Link role="menuitem" to="/dashboard" className={item} onClick={() => setOpen(false)}>
              <LayoutDashboard aria-hidden="true" className="size-4" /> Staff Dashboard
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            className={`${item} w-full`}
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/');
            }}
          >
            <LogOut aria-hidden="true" className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
