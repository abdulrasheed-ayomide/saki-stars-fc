import { Link } from 'react-router';
import { Mail, MapPin, Phone } from 'lucide-react';
import { mainNavigation, legalNavigation } from '../../config/navigation.js';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { Container } from './Container.jsx';

const SOCIAL = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['x', 'X (Twitter)'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
];

export function SiteFooter() {
  const { settings } = useSettings();
  const social = SOCIAL.filter(([key]) => settings.social?.[key]);
  const contact = settings.contact || {};
  return (
    <footer className="mt-auto bg-brand-950 text-brand-100">
      <Container className="py-10">
        <div className="grid gap-8 md:grid-cols-[1.2fr_2fr]">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-white">{settings.name}</p>
            {settings.tagline && <p className="mt-1 text-sm">{settings.tagline}</p>}
            <ul className="mt-4 space-y-2 text-sm">
              {contact.address && (
                <li className="flex gap-2">
                  <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>{contact.address}</span>
                </li>
              )}
              {contact.phone && (
                <li>
                  <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="flex min-h-10 items-center gap-2 hover:text-white">
                    <Phone aria-hidden="true" className="size-4 shrink-0" />
                    {contact.phone}
                  </a>
                </li>
              )}
              {contact.email && (
                <li>
                  <a href={`mailto:${contact.email}`} className="flex min-h-10 items-center gap-2 hover:text-white">
                    <Mail aria-hidden="true" className="size-4 shrink-0" />
                    {contact.email}
                  </a>
                </li>
              )}
            </ul>
            {social.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-x-4" aria-label="Social media">
                {social.map(([key, label]) => (
                  <li key={key}>
                    <a href={settings.social[key]} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center text-sm font-medium hover:text-white hover:underline">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav aria-label="Footer">
            <ul className="grid grid-cols-1 gap-x-4 xs:grid-cols-2 sm:grid-cols-3">
              {mainNavigation.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="flex min-h-10 items-center text-sm hover:text-white hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/search" className="flex min-h-10 items-center text-sm hover:text-white hover:underline">
                  Search
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-4 text-xs text-brand-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {settings.name}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-4">
            {legalNavigation.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="flex min-h-10 items-center hover:text-white hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}
