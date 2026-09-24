# Phase 1 — Project Foundation: Report

Prompt version: MASTER_PROMPT.md v1.1
Date: 2026-09-23

## Goal

Build a working base for the frontend and backend: configuration, API foundation, database
connection, error handling, security basics, and a responsive site shell that works from 240px up.

## What was built

### Backend (`server/`)

| File | Purpose |
|------|---------|
| `src/config/env.js` | Reads and validates every environment variable, reporting all problems at once. In production it refuses to start without `CORS_ORIGINS`, or with `*` or non-https origins. |
| `src/app.js` | Express app: Helmet security headers, CORS allowlist with credentials, 100 KB JSON limit, request IDs, `/api/v1` router, standard 404 and error handling. |
| `src/server.js` | Starts the server, connects to MongoDB with retry and backoff, shuts down cleanly on SIGTERM. |
| `src/db/connection.js` | Mongoose connection. `sanitizeFilter` blocks `$gt`-style query injection. Automatic index builds are off in production. |
| `src/middleware/errorHandler.js` | One error format for every response. Stack traces and database errors are never sent in production. |
| `src/middleware/rateLimit.js` | Baseline API rate limit. Stricter limits for login and similar routes come in Phase 2. |
| `src/middleware/requestId.js` | `X-Request-Id` on every response, with unsafe incoming values rejected. |
| `src/utils/logger.js` | Levelled logger. Passwords, tokens, cookies, API keys, and NIN are always redacted. |
| `src/utils/AppError.js` | Errors that are safe to show to users. |
| `src/modules/health/health.routes.js` | `GET /api/v1/health` (process up) and `GET /api/v1/health/ready` (database connected). The health check is never rate-limited. |

### Frontend (`client/`)

| File | Purpose |
|------|---------|
| `src/app/routes.jsx` | Routes for every Section 7 navigation item, with lazy-loaded pages and a 404. |
| `src/layouts/PublicLayout.jsx` | Skip link, header, server-status notice, main content, footer, scroll restoration. |
| `src/components/layout/SiteHeader.jsx` | Sticky header. Inline navigation from 1280px; menu button below that. |
| `src/components/layout/MobileMenu.jsx` | Full-screen menu dialog: keeps keyboard focus inside, Escape closes, the page behind can't scroll, focus returns to the menu button, 48px-tall links. |
| `src/components/layout/Container.jsx` | Page width and side padding (8px at 240px, growing with screen size). |
| `src/components/feedback/ServerStatusNotice.jsx` | "Connecting to the club server…" while a free Render server wakes up, then "not responding" with a Try again button (Section 64A). |
| `src/components/feedback/StatusMessage.jsx` | Shared layout for not-found, error, and not-yet-available pages. |
| `src/services/apiClient.js` | Single `fetch` wrapper: sends cookies, has a timeout, and turns every failure into an `ApiError` with a user-safe message. |
| `src/pages/HomePage.jsx` | Hero with the two calls to action. Other homepage sections arrive in Phase 7, with no fake data before then. |
| `src/pages/SectionUnavailablePage.jsx` | Honest "not available yet" page for sections not built yet. |
| `src/pages/NotFoundPage.jsx`, `RouteErrorPage.jsx` | 404 page, and a crash page that shows inside the layout, including a "new version available" case after a deployment. |
| `src/index.css` | Tailwind theme: `xs` breakpoint at 360px, dark-blue brand colours, system fonts, long-word wrapping, visible focus rings, reduced-motion support. |
| `tests/responsive/check-responsive.mjs` | Automated Section 59 check. |

## Test results

| Check | Result |
|-------|--------|
| Backend tests (Vitest + Supertest) | **20 / 20 passed**: health, 404 format, malformed JSON, oversized body, no leaked error details, bad request ID, security headers, CORS allow/deny, rate limit, health never limited, env validation, log redaction |
| Frontend tests (Vitest + Testing Library) | **13 / 13 passed**: homepage, every nav route resolves, 404, page titles, menu open/close/Escape/focus trap/scroll lock/navigation, offline notice, API client errors |
| Production build | Passed. Initial JavaScript is **105 KB gzipped**, within the 200 KB budget (Section 56A). |
| Responsive check | **Passed, 104 page states**: widths 240, 280, 320, 360, 375, 414, 768, 1024, 1280, 1440, 1920; landscape 568×320 and 740×360; 240px with 150% font; 360px with 200% font; menu open at every width below 1280; waking and offline notices at 240px |
| Frontend → API through the `/api` proxy | Passed |
| `npm audit` (production dependencies) | 0 vulnerabilities in both projects |
| Server start without MongoDB | Health check answers, readiness returns 503, and the connection retries. Without `MONGODB_URI` it stops with a clear message. |

### Errors found and fixed during testing

1. **Responsive check reported "header wraps" at large font sizes.** This was a false alarm from
   the test itself: with a larger system font the header correctly grows taller, but it stays on
   one row. The check now tests whether items actually move to a second row, and I confirmed the
   checker still catches real overflow by planting a 320px-wide element at 240px.
2. **jsdom does not support `window.scrollTo`,** which caused noisy test output. A test-only stub was added.
3. **`NotFoundPage` was loaded both lazily and directly.** It is now loaded directly (it is tiny), so the build has no duplicate module.

## Not tested here

- A real MongoDB Atlas connection: this environment has no database. The retry and readiness logic is tested; connecting with your Atlas URI is the first thing to try locally.
- Real iPhone Safari and Android Chrome devices: the responsive checks use Chromium with phone-sized screens.

## Decisions to make before Phase 2

1. **Cookie hosting (Section 24A).** Recommended: a Vercel `/api` rewrite to Render now, and `api.<club-domain>` once the domain is connected.
2. **Is there one Director or can there be several?** Also: who runs the Director recovery script (Section 17)?
3. **The club's domain name**, so the Resend email setup (SPF, DKIM, DMARC) can start early. DNS changes take time.

## Next phase

**Phase 2: Authentication.** Registration, email verification, login, logout, password
reset, short-lived access tokens, rotated refresh tokens stored as hashes, reuse detection,
session management, and stricter rate limits on authentication routes.
