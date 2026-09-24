import { useEffect } from 'react';
import { useSettings } from '../app/SettingsProvider.jsx';

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Page title, description and Open Graph tags. Dynamic pages pass their own
 * description and image once their data has loaded.
 */
export function useSeo({ title, description, image, type = 'website', noindex = false } = {}) {
  const { settings } = useSettings();
  useEffect(() => {
    const club = settings.name;
    document.title = title ? `${title} | ${club}` : settings.seo?.title || club;
    const desc = description || settings.seo?.description || `Official website of ${club}: fixtures, results, teams, players and club news.`;
    setMeta('name', 'description', desc.slice(0, 300));
    setMeta('property', 'og:title', title || club);
    setMeta('property', 'og:description', desc.slice(0, 300));
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:site_name', club);
    setMeta('property', 'og:url', window.location.href);
    setMeta('property', 'og:image', image || settings.seo?.image?.url || settings.logo?.url || '');
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : '');
  }, [title, description, image, type, noindex, settings]);
}

/** Kept for existing pages: title only. */
export function useDocumentTitle(pageTitle) {
  useSeo({ title: pageTitle || undefined });
}
