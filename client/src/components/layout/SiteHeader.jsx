import { useCallback, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { Menu, Search } from 'lucide-react';
import { mainNavigation } from '../../config/navigation.js';
import { Container } from './Container.jsx';
import { ClubMark } from './ClubMark.jsx';
import { MobileMenu } from './MobileMenu.jsx';
import { AccountMenu } from './AccountMenu.jsx';

const MENU_ID = 'main-menu';

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    // Return focus to the button that opened the menu.
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-brand-900 text-white shadow-sm">
      <Container className="flex min-h-14 items-center justify-between gap-2 py-1">
        <ClubMark />

        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center gap-0.5">
            {mainNavigation.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium ${
                      isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-0.5">
          <Link to="/search" aria-label="Search" className="grid size-11 place-items-center rounded-md hover:bg-white/10">
            <Search aria-hidden="true" className="size-5" />
          </Link>
          <AccountMenu />
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-white/10 xl:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
          >
            <Menu aria-hidden="true" className="size-6" />
          </button>
        </div>
      </Container>

      {menuOpen && <MobileMenu id={MENU_ID} onClose={closeMenu} />}
    </header>
  );
}
