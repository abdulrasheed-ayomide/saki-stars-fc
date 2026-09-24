/**
 * Responsive check.
 *
 * Opens every public route at every required width and fails if:
 *  - the page scrolls horizontally,
 *  - any visible element sticks out past the right edge of the screen,
 *  - an interactive element is smaller than 40x40px,
 *  - the header wraps onto more than one row,
 *  - the mobile menu overflows or cannot be opened.
 * Also runs with larger system font sizes and short landscape heights.
 *
 * Usage: build the client, start `vite preview`, then:
 *   BASE_URL=http://localhost:4173 node tests/responsive/check-responsive.mjs
 * The API should be running (the preview server proxies /api) so pages show real content.
 * Limit the routes with ROUTES=/,/news
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOT_DIR = path.resolve('tests/responsive/screenshots');
const MIN_TARGET = 40;

const WIDTHS = [240, 280, 320, 360, 375, 414, 768, 1024, 1280, 1440, 1920];
const ROUTES = (process.env.ROUTES || [
  '/', '/club', '/teams', '/players', '/fixtures-results', '/competitions', '/news', '/videos',
  '/gallery', '/staff', '/contact', '/login', '/register', '/privacy', '/unknown-page',
].join(',')).split(',');
const EXTRA = [
  { name: 'landscape 568x320', width: 568, height: 320, fontScale: 1 },
  { name: 'landscape 740x360', width: 740, height: 360, fontScale: 1 },
  { name: '240px + 150% font', width: 240, height: 640, fontScale: 1.5 },
  { name: '360px + 200% font', width: 360, height: 740, fontScale: 2 },
];
const SCREENSHOT_WIDTHS = new Set([240, 320, 768, 1280]);
const MENU_BREAKPOINT = 1280; // xl: inline navigation from here up

async function inspect(page) {
  return page.evaluate((minTarget) => {
    const vw = document.documentElement.clientWidth;
    const problems = [];
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const text = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
      return `<${el.tagName.toLowerCase()}${id}> "${text}"`;
    };
    const visible = (el) => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 && r.height <= 1) return false; // sr-only
      return true;
    };
    // Inside a scroll container that is allowed to scroll sideways (e.g. data tables).
    const inScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
      }
      return false;
    };

    const docWidth = document.documentElement.scrollWidth;
    if (docWidth > vw) problems.push(`page scrolls horizontally: content ${docWidth}px > viewport ${vw}px`);

    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el) || inScroller(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        problems.push(`overflows screen: ${describe(el)} (left ${Math.round(r.left)}, right ${Math.round(r.right)})`);
      }
    }

    for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]')) {
      if (!visible(el)) continue;
      if (el.closest('.sr-only')) continue;
      // WCAG 2.5.8 exceptions: a link inside a sentence of text, and a checkbox/radio whose
      // <label> is also clickable (the label then counts as the target).
      const block = el.closest('p, label, li, td');
      if (el.tagName === 'A' && block && block !== el && block.textContent.trim().length > el.textContent.trim().length + 3 && getComputedStyle(el).display === 'inline') continue;
      let r = el.getBoundingClientRect();
      if (el.labels?.length) {
        const l = el.labels[0].getBoundingClientRect();
        r = { width: Math.max(r.width, l.width), height: Math.max(r.height, l.height) };
      }
      if (r.width < minTarget || r.height < minTarget) {
        problems.push(`small touch target ${Math.round(r.width)}x${Math.round(r.height)}: ${describe(el)}`);
      }
    }

    // Header must stay on one row: every visible item in the header bar shares a row with the first.
    // (Height alone is not a test: with a larger system font the header correctly grows taller.)
    const bar = document.querySelector('header > div');
    if (bar) {
      const items = [...bar.children].filter(visible).map((el) => el.getBoundingClientRect());
      const first = items[0];
      for (const r of items.slice(1)) {
        if (r.top >= first.bottom || r.bottom <= first.top) {
          problems.push('header wraps onto a second row');
          break;
        }
      }
    }

    return [...new Set(problems)];
  }, MIN_TARGET);
}

async function run() {
  await mkdir(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const failures = [];
  let checks = 0;

  const cases = [
    ...WIDTHS.map((width) => ({ name: `${width}px`, width, height: width < 768 ? 740 : 900, fontScale: 1 })),
    ...EXTRA,
  ];

  for (const c of cases) {
    const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, hasTouch: c.width < 1024 });
    const page = await context.newPage();
    // Answer the health check so the result does not depend on a running API.
    await page.route('**/api/v1/health', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"status":"ok"}}' }),
    );
    if (c.fontScale !== 1) {
      // Same as the user raising the browser's default font size: rem units *and*
      // rem-based breakpoints scale, exactly as they would on a real phone.
      const cdp = await context.newCDPSession(page);
      await cdp.send('Page.enable');
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: Math.round(16 * c.fontScale), fixed: Math.round(13 * c.fontScale) } });
    }

    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      await page.locator('main h1').first().waitFor();
      checks += 1;
      for (const p of await inspect(page)) failures.push(`[${c.name}] ${route}: ${p}`);

      if (route === '/' && SCREENSHOT_WIDTHS.has(c.width) && c.fontScale === 1 && !c.name.startsWith('landscape')) {
        await page.screenshot({ path: path.join(SHOT_DIR, `home-${c.width}.png`), fullPage: true });
      }
    }

    // Mobile menu
    if (c.width < MENU_BREAKPOINT) {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
      const button = page.getByRole('button', { name: 'Open menu' });
      if (!(await button.isVisible())) {
        failures.push(`[${c.name}] menu button not visible`);
      } else {
        await button.click();
        const dialog = page.getByRole('dialog', { name: 'Main menu' });
        await dialog.waitFor();
        checks += 1;
        for (const p of await inspect(page)) failures.push(`[${c.name}] menu open: ${p}`);
        // Last link must be reachable by scrolling inside the menu on short screens.
        const last = dialog.getByRole('link', { name: 'Contact' });
        await last.scrollIntoViewIfNeeded();
        if (!(await last.isVisible())) failures.push(`[${c.name}] menu: last link not reachable`);
        if (SCREENSHOT_WIDTHS.has(c.width) && c.fontScale === 1) {
          await page.screenshot({ path: path.join(SHOT_DIR, `menu-${c.width}.png`) });
        }
        await page.keyboard.press('Escape');
        if (await dialog.isVisible()) failures.push(`[${c.name}] menu: Escape did not close`);
      }
    } else {
      const nav = page.locator('header nav[aria-label="Main"]');
      if (!(await nav.isVisible())) failures.push(`[${c.name}] desktop navigation not visible`);
    }

    await context.close();
  }

  // Offline notice at the smallest width
  {
    const context = await browser.newContext({ viewport: { width: 240, height: 640 } });
    const page = await context.newPage();
    await page.route('**/api/v1/health', (route) => route.abort('connectionrefused'));
    await page.clock.install();
    await page.goto(`${BASE_URL}/`);
    await page.getByText('Connecting to the club server').waitFor();
    checks += 1;
    for (const p of await inspect(page)) failures.push(`[240px waking notice] ${p}`);
    await page.clock.runFor(100_000);
    await page.getByText('not responding').waitFor();
    checks += 1;
    for (const p of await inspect(page)) failures.push(`[240px offline notice] ${p}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'offline-240.png') });
    await context.close();
  }

  await browser.close();

  console.log(`Responsive check: ${checks} page states across ${cases.length + 1} screen setups.`);
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('No horizontal scrolling, overflow, small touch targets or broken menus found.');
  console.log(`Screenshots: ${SHOT_DIR}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
