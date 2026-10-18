import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { ChevronDown } from 'lucide-react';

const isUnder = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);

/**
 * Desktop navigation item that opens a short list of links (disclosure pattern: a button that
 * shows and hides links, which works with mouse, touch, keyboard and screen readers).
 * Escape closes and returns focus to the button; clicking or tabbing outside closes it;
 * Arrow Down/Up move between the links.
 */
export function NavDropdown({ item }) {
  const { pathname } = useLocation();
  // Remembers the page the list was opened on, so it closes by itself after any navigation
  // (a link chosen here, Back/Forward, or a link elsewhere).
  const [openOn, setOpenOn] = useState(null);
  const open = openOn === pathname;
  const setOpen = (value) => setOpenOn((prev) => ((typeof value === 'function' ? value(prev === pathname) : value) ? pathname : null));
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();
  const active = isUnder(pathname, item.to);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e) {
      if (!rootRef.current?.contains(e.target)) setOpenOn(null);
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const links = () => [...(rootRef.current?.querySelectorAll('a[href]') ?? [])];
  function focusLink(index) {
    const list = links();
    if (list.length) list[(index + list.length) % list.length].focus();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = links();
    const current = list.indexOf(document.activeElement);
    if (!open) {
      setOpen(true);
      requestAnimationFrame(() => focusLink(e.key === 'ArrowDown' ? 0 : -1));
    } else if (current === -1) focusLink(e.key === 'ArrowDown' ? 0 : -1);
    else focusLink(current + (e.key === 'ArrowDown' ? 1 : -1));
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (open && e.relatedTarget && !rootRef.current?.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-11 items-center gap-1 whitespace-nowrap rounded-md px-2 text-sm font-medium ${
          active || open ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
        }`}
      >
        {item.label}
        <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <ul
        id={listId}
        hidden={!open}
        className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-slate-800 shadow-lg"
      >
        {item.children.map((child) => (
          <li key={child.to}>
            <NavLink
              to={child.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex min-h-11 items-center px-4 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-100 focus-visible:bg-slate-100'}`
              }
            >
              {child.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mobile-menu version: a full-width button that expands its links in place. */
export function MobileNavGroup({ item, onNavigate, linkClass }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(isUnder(pathname, item.to));
  const listId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-base font-medium ${
          isUnder(pathname, item.to) ? 'bg-white/15 text-white' : 'text-white hover:bg-white/10'
        }`}
      >
        {item.label}
        <ChevronDown aria-hidden="true" className={`size-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <ul id={listId} hidden={!open} className="mt-1 grid gap-1 border-l-2 border-white/20 pl-3 ml-3">
        {item.children.map((child) => (
          <li key={child.to}>
            <NavLink to={child.to} onClick={onNavigate} className={linkClass}>
              {child.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  );
}
