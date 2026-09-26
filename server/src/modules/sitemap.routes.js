import { Router } from 'express';
import { publicPlayerFilter } from './players/players.routes.js';
import { News, Player, Team, Competition, Match } from '../models/index.js';

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

/** sitemap.xml and robots.txt for search engines (Vercel rewrites both here). Public records only. */
export function createSitemapRouter({ config }) {
  const router = Router();
  router.get('/sitemap.xml', async (req, res) => {
    const base = config.appUrl;
    const staticPaths = ['/', '/club', '/teams', '/players', '/fixtures-results', '/competitions', '/news', '/videos', '/gallery', '/staff', '/contact', '/privacy', '/terms', '/cookie-policy'];
    const [news, players, teams, comps, matches] = await Promise.all([
      News.find({ status: 'published', deletedAt: null }).select('slug updatedAt').sort({ publishedAt: -1 }).limit(2000).lean(),
      Player.find(await publicPlayerFilter()).select('slug updatedAt').limit(2000).lean(),
      Team.find({ isClubTeam: true, status: 'active' }).select('slug updatedAt').lean(),
      Competition.find({ status: 'active' }).select('slug updatedAt').lean(),
      Match.find({ deletedAt: null }).select('_id updatedAt').sort({ kickoffAt: -1 }).limit(1000).lean(),
    ]);
    const urls = [
      ...staticPaths.map((p) => ({ loc: `${base}${p}` })),
      ...news.map((n) => ({ loc: `${base}/news/${n.slug}`, lastmod: n.updatedAt })),
      ...players.map((p) => ({ loc: `${base}/players/${p.slug}`, lastmod: p.updatedAt })),
      ...teams.map((t) => ({ loc: `${base}/teams/${t.slug}`, lastmod: t.updatedAt })),
      ...comps.map((c) => ({ loc: `${base}/competitions/${c.slug}`, lastmod: c.updatedAt })),
      ...matches.map((m) => ({ loc: `${base}/matches/${m._id}`, lastmod: m.updatedAt })),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}</url>`)
      .join('\n')}\n</urlset>\n`;
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(body);
  });
  // Served at /robots.txt by the Vercel rewrite; needs APP_URL for the absolute sitemap URL.
  router.get('/robots.txt', (req, res) => {
    const lines = ['User-agent: *', 'Allow: /'];
    for (const path of ['/dashboard', '/portal', '/account', '/api/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/search']) lines.push(`Disallow: ${path}`);
    lines.push('', `Sitemap: ${config.appUrl}/sitemap.xml`, '');
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(lines.join('\n'));
  });

  return router;
}
