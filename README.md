# Saki Stars Sports Club platform

The club's public website, Player Portal and Staff Dashboard, in one repository.

| Folder    | What it is                                                                 |
|-----------|----------------------------------------------------------------------------|
| `client/` | React 19 + Vite + Tailwind CSS 4 + React Router 7 website (deploys to Vercel) |
| `server/` | Node.js + Express 5 REST API with MongoDB/Mongoose (deploys to Render)     |
| `docs/`   | Deployment, operations and the completion report                           |

- **Public website:** home page, club, teams, players, fixtures & results, match centre,
  competitions and league tables, news, videos, gallery, staff, contact, search, legal pages.
- **Player Portal** (`/portal`): for approved players, covering their profile, team, matches, stats,
  announcements and documents.
- **Staff Dashboard** (`/dashboard`): every club operation, controlled by role, permission and
  scope, all checked on the server.
- **Account area** (`/account`): profile, applications, notifications, sessions and security, privacy.

Everything shown on the website comes from the database. There is no invented content.

## Requirements

- **Node.js 22 LTS (22.22+) or 24.15+.** The server runs on 20.19+, but the client's test tools
  need 22.22 / 24.15 or newer. Check your version with `node -v`.
- A **MongoDB Atlas** cluster (the free M0 tier is fine to start).
- Optional for local development, required in production:
  - **Cloudinary** for photos, logos, gallery and private documents
  - **Resend** for email (verification, password reset, notifications)

## Run locally

Open two terminals.

**Terminal 1: API**

```bash
cd server
npm install
copy .env.example .env        # Windows   (Mac/Linux: cp .env.example .env)
```

Open `server/.env` and set `MONGODB_URI` to your Atlas connection string. Replace **all** of
`<user>`, `<password>` and `<cluster>`; no `<` or `>` characters may remain. If your password
contains special characters (`@ : / ? # [ ] %`), URL-encode them, for example `@` becomes `%40`.
In Atlas, under *Network Access*, allow your current IP address.

```bash
npm run director:create       # once: creates the first Club Director account
npm run dev                   # http://localhost:4000/api/v1/health
```

**Terminal 2: website**

```bash
cd client
npm install
copy .env.example .env.local  # Windows   (Mac/Linux: cp .env.example .env.local)
npm run dev                   # http://localhost:5173
```

Sign in at http://localhost:5173/login with the Director account, then open **Dashboard**.

Without `RESEND_API_KEY`, emails (such as verification links) are printed in the API
terminal instead of being sent. Without Cloudinary keys, uploads are switched off and the
dashboard says so; everything else works.

### Demo data (optional, development only)

```bash
cd server
npm run seed:dev              # clearly-labelled "(Demo)" teams, players, fixtures, news
npm run seed:dev -- --remove  # removes exactly what the seed added
```

The seed refuses to run when `NODE_ENV=production`. Never point it at the live club database.

## Scripts

| Where    | Command                          | What it does |
|----------|----------------------------------|--------------|
| server   | `npm run dev`                    | API with auto-restart, reads `server/.env` |
| server   | `npm start`                      | API for production (Render sets the environment) |
| server   | `npm test`                       | Unit tests; integration tests run when `TEST_MONGODB_URI` is set |
| server   | `npm run lint`                   | ESLint |
| server   | `npm run director:create`        | First Director, or `-- --recover` to restore Director access |
| server   | `npm run db:indexes`             | Build database indexes and apply data repairs (run after each deploy) |
| server   | `npm run backup:export`          | Full database backup to `server/backups/*.json.gz` |
| server   | `npm run backup:restore -- file` | Restore a backup (only into an empty database unless `--replace`) |
| server   | `npm run seed:dev`               | Development demo data (see above) |
| client   | `npm run dev`                    | Website with the `/api` proxy to the local API |
| client   | `npm run build`                  | Production build into `client/dist` |
| client   | `npm test`                       | Component, route and API-client tests |
| client   | `npm run lint`                   | ESLint |
| client   | `npm run test:responsive`        | Every public page from 240px to 1920px, large fonts, landscape |

### Integration tests

The API integration tests need a throwaway MongoDB (a local `mongod` or a separate Atlas
database, **never** the live one):

```bash
cd server
set TEST_MONGODB_URI=mongodb://127.0.0.1:27017     # Windows (Mac/Linux: export ...)
npm test
```

### Responsive check

```bash
cd client
npm run build
npx vite preview --port 4173      # keep the API running so pages have content
npm run test:responsive           # in another terminal
```

It uses Playwright's Chromium. Set `CHROMIUM_PATH` if Chromium is somewhere else.

## API conventions

- Base path `/api/v1`. Success: `{ "data": … }`. Lists: `{ "data": { "items": [], "page", "limit", "total", "pages" } }`.
- Errors: `{ "error": { "code": "NOT_FOUND", "message": "Safe message.", "requestId": "…" } }`.
- Every response carries `X-Request-Id`; use it to find the matching server log line.
- Browser requests that use the sign-in cookie must send `X-Requested-With: fetch` (CSRF guard).

## More documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): Atlas, Render, Vercel, Cloudinary, Resend, domain.
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md): Director bootstrap and recovery, roles, backups, data retention.
- [`docs/COMPLETION_REPORT.md`](docs/COMPLETION_REPORT.md): what was built, APIs, models, security.

Never commit `.env` files. Only the `.env.example` files belong in Git.
