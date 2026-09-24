# Technical completion report: Saki Stars Sports Club platform

Date: 23 September 2026 · One repository: `client/` (Vercel) + `server/` (Render) + MongoDB Atlas.

---

## 1. What already existed

A foundation with no club functionality:

- **server/**: Express app shell: environment validation, Helmet, CORS allowlist, request IDs,
  JSON error format, a baseline rate limit, logger with secret redaction, MongoDB connection with
  retry, `GET /health` and `/health/ready`. No models, no authentication, no business routes.
- **client/**: React/Vite/Tailwind shell: routes for the main navigation, header, full-screen
  mobile menu, footer, server-waking notice, 404/error pages, a homepage hero, and an honest
  "not available yet" page used for **every** other section. An automated responsive checker.
- Tests for the above (server 20, client 13). `docs/PHASE_0_AUDIT.md` and `PHASE_1_REPORT.md`.

Everything that existed was kept and built on: the app shell, error format, logger, health
routes, layout, mobile menu, and responsive checker are all still in use.

## 2. What was changed

- **Server:** 24 models, 24 route modules (182 endpoints), services (tokens, email, media,
  notifications, audit, settings, standings, statistics), RBAC, validation, 5 operational
  scripts, and 105 tests. `sanitizeFilter` was replaced by a request-level NoSQL-operator guard
  (it broke legitimate queries); the rate limiter was rebuilt with per-route limits.
- **Client:** every "not available yet" page was replaced by a real page. Added the Player Portal,
  Staff Dashboard, account area, and authentication pages. The auth/API client was rewritten
  (in-memory access token, silent refresh). There are now 108 source files, and the
  `SectionUnavailablePage` was deleted.
- **Config/docs:** `.env.example` files rewritten, `vercel.json` with API/sitemap/robots rewrites
  and security headers, Vite proxy, ESLint in both projects, new README, DEPLOYMENT, OPERATIONS
  and this report.

## 3. Features implemented

**Public website (all database-driven, with empty states instead of invented content):**
homepage (hero from Settings, next match with countdown, latest result, news, league table,
club teams, featured players, videos, club stats, gallery, newsletter); club history, values,
honours and stadium; teams and team detail (squad, fixtures, results, season record); players
and player profiles (public stats computed from matches); fixtures & results with filters;
match centre (line-ups, events, stats, report, highlights); competitions with calculated
standings; news with categories and search; videos (YouTube, privacy-enhanced embeds);
gallery with lightbox; staff; contact form (honeypot + rate limit); site search; newsletter
double opt-in; Terms / Privacy / Cookie policy pages with versions; cookie notice; SEO tags,
sitemap.xml and robots.txt.

**Accounts:** register, email verification, sign in/out, sign out everywhere, forgot/reset
password, change password, active sessions list with revoke, profile, notifications centre,
player and staff applications with status tracking, privacy page (data export, deletion
request, legal re-acceptance).

**Player Portal:** overview (profile completion, next match, announcements), own profile with
editable personal details (only permitted fields), team and squad, own matches, own statistics,
announcements, notifications, and private documents (upload/view/delete via signed links).

**Staff Dashboard:** see section 7.

## 4. Backend APIs

All under `/api/v1`. The full list of 182 endpoints is in the code (`server/src/routes.js`
mounts every module). By area:

| Area | Endpoints |
|---|---|
| Health | `GET /health`, `GET /health/ready` |
| Auth | `POST /auth/register, verify-email, resend-verification, login, refresh, logout, logout-all, forgot-password, reset-password, change-password`; `GET /auth/me, /auth/sessions`; `DELETE /auth/sessions/:id` |
| Account | `PATCH /account/profile`; `POST /account/consents`; `GET /account/data-export`; `POST/DELETE /account/deletion-request`; `GET /account/applications`; `POST /account/applications/player`, `/staff`, `/:kind/:id/withdraw` |
| Public | `GET /settings, /club-stats, /legal/:doc, /seasons, /teams[/:id], /competitions[/:id][/standings\|/matches\|/news], /matches[/next\|/latest-result\|/:id], /players[/:id], /staff[/:id], /news[/:slug], /videos[/:id], /gallery, /search, /sitemap.xml, /robots.txt`; `POST /contact, /newsletter/subscribe, /newsletter/confirm, /newsletter/unsubscribe` |
| Comments | `GET/POST /comments`; `PATCH/DELETE /comments/:id`; `POST /comments/:id/report` |
| Notifications | `GET /notifications[/unread-count\|/announcements]`; `POST /notifications/read-all, /:id/read`; `DELETE /notifications/:id` |
| Media | `POST /media/upload` (images, video, private documents; type sniffed from file content) |
| Player Portal | `GET /portal/overview, profile, team, matches, stats`; `PATCH /portal/personal`; `POST /portal/documents`; `GET/DELETE /portal/documents/:docId` |
| Admin: dashboard | `GET /admin/dashboard/overview, /system` |
| Admin: football | CRUD `/admin/seasons, /teams, /competitions, /matches`; competitions `/:id/adjustments` (GET/POST/DELETE); matches `PUT /:id/result, /:id/report, /:id/highlights`, `PATCH /:id/standings` |
| Admin: people | CRUD `/admin/players` + `/:id/documents`; `/admin/staff` (`permissions` catalogue, `appoint`, `/:id/profile`, `/:id/access`, suspend/reactivate/remove); `/admin/applications/players\|staff` (list, detail, approve, reject); `/admin/users` (list, detail, suspend, reactivate, deactivate, revoke-sessions, anonymize) |
| Admin: content | `/admin/news` (CRUD + `POST /:id/submit\|withdraw\|publish\|unpublish\|archive`); `/admin/videos`, `/admin/gallery` (CRUD); `/admin/comments` (list, stats, moderate, delete); `/admin/announcements` |
| Admin: operations | `/admin/reports` (list, detail, create, review); `/admin/scouting` (scouts, assignments CRUD, reports CRUD + private attachments); `/admin/contact/messages` (list, update), `/admin/contact/subscribers` (list/CSV); `/admin/settings` (GET/PUT, `PUT /legal/:doc`); `/admin/search`; `/admin/audit` (+ `/actions`) |

Conventions: `{ data }` / `{ error: { code, message, requestId } }`, paginated lists, zod
validation on every body/query/param, and 404 rather than 403 where existence itself is private.

## 5. Database models

| Model | Purpose |
|---|---|
| `User` | Account: email, bcrypt hash, role (`user`/`player`/`staff`), status (`pending`/`active`/`suspended`/`deactivated`), verification/reset token *hashes*, lockout counters, consents with legal versions, deletion request, anonymisation |
| `RefreshSession` | One row per refresh token: SHA-256 hash, family ID, rotation/revocation time and reason, device/IP; expires automatically |
| `Staff` | Staff role, per-person permission grants with scope, assigned teams/players, public profile and visibility, status |
| `Player` | Public profile (name, position, number, photo, bio, featured, visibility, privacy-safe slug); `restricted` (DOB, contacts, address, emergency contact, guardian, documents); `sensitive` (national ID, medical); minor flag; historical stat adjustments |
| `PlayerApplication`, `StaffApplication` | Applications with guardian consent for minors, review decision, notes |
| `Season`, `Team`, `Competition`, `Match`, `StandingsAdjustment` | Football data: club/opponent teams, competition rules (points, tie-breakers), matches with line-ups, events, stats, report, highlights, standings flags; audited table corrections |
| `News`, `Video`, `GalleryItem` | Content with workflow status, soft delete, SEO fields |
| `Comment` | Comments on news/matches with moderation status, reports, spam flags |
| `Notification`, `Announcement` | Per-user notifications (1-year expiry) and audience announcements |
| `ContactMessage`, `NewsletterSubscriber` | Contact inbox (2-year expiry) and double-opt-in subscribers |
| `Report`, `ScoutingAssignment`, `ScoutingReport` | Internal staff reports and private scouting |
| `AuditLog` | Who did what, when, from where; outcome (`success`/`denied`); metadata without secrets |
| `ClubSettings` | Single document: identity, contacts, social, stadium, history/values/honours, homepage text, feature switches, legal documents with versions |

Soft delete (`deletedAt`/`deletedBy`) on content, players, matches and staff; played matches
cannot be deleted. Indexes for every list/filter query, plus unique and expiry indexes.

## 6. Authentication and security

- **Tokens:** 15-minute HS256 access token held in memory only (never in localStorage); 30-day
  refresh token in an `HttpOnly`, `Secure` (production), `SameSite=Lax` cookie scoped to
  `/api/v1/auth`. Refresh tokens are **stored only as SHA-256 hashes** and **rotated** on every
  use. Reusing an old token revokes the whole session family, notifies the user by email and
  in-app, and is audited. A 15-second grace window stops a double reload from signing people out.
- **Revocation takes effect immediately:** every request checks the session family and account
  status, so logout, suspension, a password change or staff suspension end access at once.
- **Passwords:** bcrypt (12 rounds); at least 10 characters with letters and numbers; common
  passwords and passwords containing the email or name are refused. 10 failures lock the
  account for 15 minutes. Identical messages for unknown email and wrong password.
- **Email tokens:** single-use, hashed, 24 h (verify) / 30 min (reset); reset signs out every device.
- **CSRF:** cookie endpoints require `X-Requested-With` and an allowlisted `Origin`.
- **RBAC:** role + permission + scope (`all`, `assigned_teams`, `assigned_players`, `own`) checked
  on the server for every staff request; self-modification blocked; no granting beyond your own
  access; last Director protected; denied attempts audited.
- **Privacy:** 4-tier player data classification with separate serializers for each tier.
  Restricted/sensitive views are audited. Minors' surnames are hidden publicly, including URLs and
  the sitemap. Private documents use Cloudinary private delivery with short-lived signed URLs.
- **API hardening:** Helmet, strict CORS, 100 KB JSON limit, operator-injection guard, zod
  validation, per-route rate limits (login per IP+email, registration, reset, contact,
  comments, uploads, search), upload type sniffing by content, database-down 503s, no stack
  traces in production, log redaction of passwords, tokens, cookies and keys.
- **Director bootstrap:** only via `npm run director:create` with database access; `--recover`
  for lost access; both audited.
- `npm audit`: 0 vulnerabilities in both projects.

## 7. Dashboard functionality

Menu items appear only for permissions the person holds (the server enforces the same rules).

- **Overview:** counts, queues (applications, held comments, messages), upcoming fixtures,
  recent results, recent reports and activity, all limited to the person's scope.
- **Applications:** review player/staff applications, approve (team, number, role, website visibility) or reject with reason.
- **Users:** search/filter, suspend, reactivate, deactivate, sign out everywhere, delete personal data (for deletion requests).
- **Staff:** appoint, edit public profile, edit permissions and scope per person (with role
  presets), assign teams/players, suspend/reactivate/remove.
- **Players:** create/edit, public and private tabs by permission, documents, stat adjustments, visibility.
- **Teams, Seasons, Competitions:** CRUD with competition rules; **Standings** with audited adjustments.
- **Matches:** fixtures, result entry with line-ups, scorers/assists/cards/substitutions, match
  stats, validation, match report, YouTube highlights, standings flags (friendly/abandoned).
- **News:** editor with Markdown preview, cover image, draft → review → publish → archive.
- **Videos, Gallery:** YouTube links, Cloudinary uploads, categories, featured.
- **Comments:** moderation queue with spam/reports; **Announcements** to chosen audiences.
- **Reports** (staff reports and reviews), **Scouting** (assignments, private reports and attachments).
- **Contact** inbox and newsletter subscribers with CSV export.
- **Notifications, Audit log** (filters by person/action/outcome/date), **Settings** (identity,
  homepage, features, legal documents with versions), **System** (health, integrations,
  security counters, proxy/IP check, collections).

## 8. What depends on external credentials

| Needs | Without it |
|---|---|
| **MongoDB Atlas** `MONGODB_URI` | API returns 503; nothing works. |
| **Resend** `RESEND_API_KEY` + verified domain for `EMAIL_FROM` | Dev: emails print in the API terminal. Production: the API refuses to start, since users could not verify email or reset passwords. |
| **Cloudinary** 3 keys | Uploads are disabled with a clear message; YouTube videos, text content and everything else work. |
| **A domain** | Needed for Resend sending to real users and for a professional URL. The Vercel URL works meanwhile. |
| **Club content** | Real teams, players, fixtures, news, logo and legal text must be entered by the club. |

## 9. Environment variables

**Server** (`server/.env` locally, Render Environment in production; documented in `server/.env.example`):

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `development` / `production` |
| `PORT` | no | default 4000 (Render sets it) |
| `MONGODB_URI` | yes | Atlas string with the database name |
| `APP_URL` | production | public site URL for email links, sitemap |
| `CORS_ORIGINS` | production | comma-separated `https://` site origins |
| `TRUST_PROXY` | production | `2` behind Vercel rewrite + Render; `1` with `api.` subdomain; `0` local |
| `JWT_ACCESS_SECRET` | production | ≥ 32 random characters |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS` | no | 15 / 30 |
| `COOKIE_SAMESITE`, `COOKIE_SECURE`, `COOKIE_DOMAIN` | no | `lax`; Secure is forced on in production |
| `RESEND_API_KEY`, `EMAIL_FROM` | production | verified sender domain |
| `EMAIL_REPLY_TO`, `CONTACT_INBOX_EMAIL`, `EMAIL_TRANSPORT` | no | |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for uploads | all three or none |
| `CLOUDINARY_FOLDER`, `MAX_IMAGE_MB`, `MAX_VIDEO_MB`, `MAX_VIDEO_SECONDS`, `MAX_DOCUMENT_MB` | no | sensible defaults |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `LOG_LEVEL`, `BCRYPT_ROUNDS` | no | |
| `DIRECTOR_EMAIL`, `DIRECTOR_NAME`, `DIRECTOR_PASSWORD` | scripts only | non-interactive Director creation |
| `TEST_MONGODB_URI` | tests only | throwaway database |

**Client** (`client/.env.local`, Vercel Environment): `VITE_API_BASE_URL=/api/v1`;
`VITE_DEV_API_TARGET` (dev proxy only); `VITE_CLUB_NAME`, `VITE_CLUB_SHORT_NAME` (fallback
names). All `VITE_` values are public; no secrets go in the client.

## 10. Run the client locally

```bash
cd client
npm install
copy .env.example .env.local     # Mac/Linux: cp
npm run dev                      # http://localhost:5173  (proxies /api to :4000)
```

## 11. Run the server locally

```bash
cd server
npm install
copy .env.example .env           # then set MONGODB_URI (no < > left)
npm run director:create          # first time only
npm run dev                      # http://localhost:4000/api/v1/health
npm run seed:dev                 # optional demo data; remove with -- --remove
```

Node 22.22+ or 24.15+. Tests: `npm test` in each folder (API integration tests need `TEST_MONGODB_URI`).

## 12. Deploy the client to Vercel

Replace `YOUR-RENDER-SERVICE.onrender.com` (3 places) in `client/vercel.json`, commit, import
the repo in Vercel with Root Directory `client`, Vite preset, build `npm run build`, output
`dist`, env `VITE_API_BASE_URL=/api/v1`. Full steps: `docs/DEPLOYMENT.md` §5 and §8.

## 13. Deploy the server to Render

Web Service, Root Directory `server`, build `npm ci --omit=dev`, start `npm start`, health
check `/api/v1/health`, environment from §9 (`NODE_ENV=production`, `NODE_VERSION=22`,
`TRUST_PROXY=2`, …). Then create the Director and run `npm run db:indexes` against the live
database from your computer, and confirm Dashboard → System shows your real IP.
Full steps: `docs/DEPLOYMENT.md` §1–4, §6–7.

## 14. Remaining issues that genuinely prevent production deployment

No code issue blocks deployment. These are what's left, all outside the code:

1. **Credentials and a domain** (section 8). Production will not start without Resend and a verified
   sending domain, which is deliberate.
2. **Legal texts:** the Privacy Policy, Terms and Cookie Policy must be written or approved by the
   club (ideally with advice on Nigeria's NDPA 2023, since the site processes minors' data), then
   entered in Settings. The site shows whatever is saved there.
3. **Real Atlas verification:** development testing used a MongoDB-compatible engine
   (FerretDB) because this environment had no Atlas access. That engine has no transactions, so
   the non-transactional fallback was tested. Atlas supports transactions, so the transactional
   path runs in production. Run the launch checklist in `DEPLOYMENT.md` §9 on the live stack.
4. **Not exercised against the real services:** actual Cloudinary uploads and actual Resend delivery
   (both covered by tests with stand-ins), and real iPhone/Android devices (checked with Chromium
   at phone sizes). All should be part of the launch checklist.

Known limits (not blockers): rate limits are in-memory, which is correct for one Render
instance (use a shared store if you ever scale to several). The free Render plan sleeps when
idle (30–60 s first load). Atlas M0 has no automatic backups, so use `npm run backup:export`.

## Verification performed

| Check | Result |
|---|---|
| Server tests (Vitest + Supertest, real database) | **105 / 105** |
| Client tests (Vitest + Testing Library) | **18 / 18** |
| ESLint, both projects | clean |
| Production build | passes; about 115 KB gzipped JavaScript on first load, every page lazy-loaded |
| `npm audit` | 0 vulnerabilities (client and server) |
| Browser journeys (Playwright, real API + database) | register → verify email → sign in → minor applies (guardian enforced) → Director approves → Player Portal → player edits own details → public page hides surname/private data → comment → contact message reaches dashboard → result recorded in match editor → table updates → settings change shows on homepage → anonymous `/dashboard` redirects to sign-in. **0 errors** |
| All public, dashboard, portal and account pages | load without errors |
| Responsive check | 239 page states, 240–1920 px, landscape, 150%/200% font: **no horizontal scroll, overflow or small touch targets**; dashboard, portal and account pages clean at 320/390/768 px |

Bugs found and fixed during this verification included: a reload interrupted by navigation
could sign users out (refresh grace window); minors' hidden surnames leaked through player URLs and
the sitemap (privacy-safe slugs, plus a repair in `db:indexes`); `sr-only` table headers widened
dashboard pages on phones; the dashboard overview overflowed at 320 px; production indexes
depended on a manual step (now created automatically).
