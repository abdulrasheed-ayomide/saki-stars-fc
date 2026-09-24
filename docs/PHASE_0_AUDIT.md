# Phase 0 — Repository Audit

Date: 2026-09-23
Prompt version: MASTER_PROMPT.md v1.1

## 1. What existed before Phase 1

```
sakistarsfc/
  client/                  (empty)
  docs/
    MASTER_PROMPT_v1.0.txt (original prompt)
  server/
    package.json           (npm init default, no dependencies, no scripts)
    src/
      config/              (empty)
      db/                  (empty)
      middleware/          (empty)
      modules/health/      (empty)
      utils/               (empty)
    tests/                 (empty)
```

## 2. Findings (Section 97 checklist)

| # | Item | Finding |
|---|------|---------|
| 1 | Project structure | Folder skeleton only. No source files. |
| 2 | Frontend architecture | None. `client/` is empty. |
| 3 | Backend architecture | None. Empty folders suggest a modular layout (`modules/health`), which matches Section 4. |
| 4 | Database/models | None. |
| 5 | Authentication | None. |
| 6 | Dependencies | None installed. |
| 7 | Environment configuration | None. No `.env.example`. |
| 8 | Routes | None. |
| 9 | Working features | None. |
| 10 | Problems | `server/package.json` is the npm default: CommonJS entry `index.js` that does not exist, and a failing `test` script. |
| 11 | Reusable | The folder layout (`config`, `db`, `middleware`, `modules/<domain>`, `utils`, `tests`) is sensible and is kept. |
| 12 | Must change | `server/package.json` is replaced with real scripts, ES modules, and dependencies. |
| 13 | Missing | Everything from Phase 1 onward. |
| 14 | Phases | As in Section 78. This delivery covers Phase 1 only. |
| 15 | Risks | See below. |

## 3. Risks and decisions

- **Cross-domain cookies (Section 24A).** Must be decided before Phase 2. Recommendation: use the Vercel `/api` rewrite to Render during development, then `api.<club-domain>` in production.
- **Free-tier backups (Section 64A).** Atlas M0 has no cloud backups. An independent backup job must exist before real club data is entered.
- **Render cold starts (Section 64A).** Handled in Phase 1: the frontend shows a "connecting to the club server" notice instead of a broken page.
- **Club configuration (Section 9).** The `ClubSettings` model belongs to Phase 4. Until then the frontend reads the club name from `VITE_CLUB_NAME`/`VITE_CLUB_SHORT_NAME`, which is configuration, not hard-coded logic. Phase 4 replaces it with the API.
- **Pages not yet built.** Navigation items from Section 7 point to a single honest "section not yet available" page, not fake content. Each one is replaced as its phase is built.
- **In-memory MongoDB for tests.** `mongodb-memory-server` downloads a MongoDB binary at install time. Phase 1 tests do not need a database. It is added in Phase 2, when the first models exist.
