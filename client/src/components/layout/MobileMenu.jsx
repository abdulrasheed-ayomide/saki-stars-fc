import { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { mainNavigation } from '../../config/navigation.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { ClubMark } from './ClubMark.jsx';

const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * Full-screen navigation dialog for small and medium screens.
 * Works down to 240px: one column, large touch targets, focus trapped while open,
 * Escape closes, page behind does not scroll.
 */
export function MobileMenu({ id, onClose }) {
  const panelRef = useRef(null);
  const { status, isPlayer, isStaff, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.querySelector('[aria-current="page"]')?.focus() ?? panel.querySelector(FOCUSABLE)?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const link = ({ isActive }) => `flex min-h-12 items-center rounded-md px-3 text-base font-medium ${isActive ? 'bg-white text-brand-900' : 'text-white hover:bg-white/10'}`;
  const accountLinks =
    status === 'authenticated'
      ? [{ label: 'My account', to: '/account' }, ...(isPlayer ? [{ label: 'Player Portal', to: '/portal' }] : []), ...(isStaff ? [{ label: 'Staff Dashboard', to: '/dashboard' }] : [])]
      : [
          { label: 'Sign in', to: '/login' },
          { label: 'Create account', to: '/register' },
        ];

  return (
    <div id={id} ref={panelRef} role="dialog" aria-modal="true" aria-label="Main menu" className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-brand-950 text-white xl:hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-2 xs:px-4 sm:px-6">
        <ClubMark />
        <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-md text-white hover:bg-white/10" aria-label="Close menu">
          <X aria-hidden="true" className="size-6" />
        </button>
      </div>

      <nav aria-label="Main" className="px-2 py-3 xs:px-4 sm:px-6">
        <ul className="grid gap-1 sm:grid-cols-2">
          {mainNavigation.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} onClick={onClose} className={link}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Account" className="mt-auto border-t border-white/10 px-2 py-3 xs:px-4 sm:px-6">
        <ul className="grid gap-1 sm:grid-cols-2">
          {accountLinks.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} onClick={onClose} className={link}>
                {item.label}
              </NavLink>
            </li>
          ))}
          {status === 'authenticated' && (
            <li>
              <button
                type="button"
                className="flex min-h-12 w-full items-center rounded-md px-3 text-base font-medium text-white hover:bg-white/10"
                onClick={async () => {
                  onClose();
                  await logout();
                  navigate('/');
                }}
              >
                Sign out
              </button>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
