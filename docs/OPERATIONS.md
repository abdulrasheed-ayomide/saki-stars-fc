# Operations guide

Day-to-day running of the platform: who can do what, recovering access, backups and data care.
Commands run from the `server` folder. For the live database, set `MONGODB_URI` in the terminal
first (see `DEPLOYMENT.md` step 6); never edit the live string into a file you might commit.

## 1. Accounts and roles

| Account type | How it is created | Where it works |
|---|---|---|
| **User** (fan/member) | Registers on the website, verifies email | Comments, applications, own account |
| **Player** | A user's player application is approved (or staff link an existing player record) | Player Portal |
| **Staff** | A staff application is approved, or a Director/staff manager appoints an existing user | Staff Dashboard, limited by permissions |
| **Director** | Only with `npm run director:create` (database access) | Everything |

Staff roles: Club Director, Club Chairman, Club Consultant, Team Manager, IT Manager, Media
Officer, Team Scout. A role only sets **default permissions**; the Director can change each
person's permissions in **Dashboard → Staff → (person) → Access**.

### Permissions and scope

Each permission has a scope:

- **all**: the whole club
- **assigned teams**: only the teams assigned to that person (e.g. a Team Manager's squad)
- **assigned players**: only players assigned to that person (e.g. a scout's targets)
- **own**: only things they created (e.g. their own reports)

The server checks permission and scope on **every request**. Hiding a button is only a
convenience; calling the API directly is refused the same way.

Built-in safety rules:

- Nobody can change their own role, permissions or status.
- Nobody can grant a permission (or a wider scope) they don't hold themselves.
- Only a Director can change another Director.
- The last active Director cannot be suspended, removed, demoted or deleted.
- Suspending staff, suspending a user, or changing a password signs that person out everywhere
  immediately.

### Player privacy levels

| Level | Examples | Who sees it |
|---|---|---|
| Public | first name, position, number, photo, public stats | Everyone |
| Authenticated | (reserved for signed-in-only details) | Signed-in users |
| Restricted | date of birth, phone, email, address, emergency contact, guardian, documents | Staff with `players.sensitive.view` in scope, and the player |
| Highly sensitive | national ID, medical notes | Staff with `players.highly_sensitive.view` (Director by default) |

Every view of restricted or highly sensitive data is written to the audit log. For **minors**
(under 18 from date of birth), the surname is hidden publicly by default, including in the
page address, and applications need a guardian's details and consent.

## 2. Director bootstrap and recovery

**First Director:**

```bash
npm run director:create
```

It asks for name, email and password (at least 10 characters, letters and numbers). It refuses if a Director already exists.

**Lost Director access** (the only Director forgot their password *and* lost their email, left
the club, or was compromised):

```bash
npm run director:create -- --recover
```

This adds a Director or restores an existing account to Director. It is recorded in the audit
log as `director.recovered`. Only the person holding the database credentials can run it, so
keep those credentials with a trusted club officer, not only with the developer.

Normal password loss does **not** need this: use *Forgot password* on the sign-in page.

**Recommendation:** have two Directors (for example, appoint a second trusted club officer as
Director) so one can always restore the other from the dashboard.

## 3. Everyday tasks (where to click)

| Task | Dashboard page | Permission |
|---|---|---|
| Approve players / staff | Applications | `applications.players.review` / `applications.staff.review` |
| Appoint staff, change access | Staff | `staff.manage` |
| Suspend a user, sign them out, delete personal data | Users | `users.manage` |
| Fixtures, results, line-ups, scorers, match reports | Matches | `matches.manage`, `matches.report` |
| League table corrections (points deduction etc.) | Standings | `standings.override` |
| News (draft → review → publish) | News | `news.create`, `news.publish` |
| Videos (YouTube links), gallery | Videos, Gallery | `media.manage` |
| Comment moderation | Comments | `comments.moderate` |
| Announcements to players/staff/everyone | Announcements | `announcements.send` |
| Contact messages, newsletter export (CSV) | Contact | `contact.view` |
| Club details, homepage text, legal pages | Settings | `settings.manage` |
| Who did what | Audit log | `audit.view` |
| Health, integrations, IP check | System | `system.view` |

League tables are **calculated from results**. They are never typed in. Friendlies never count.
Abandoned matches count only if marked "result stands". Corrections are recorded with a reason
and appear in the audit log.

## 4. Backups

Atlas M0 (free) has **no automatic backups**. Paid tiers (M10+) take snapshots; still keep an
independent copy outside Atlas.

**Export** (weekly, and before any big change or upgrade):

```bash
npm run backup:export                 # -> server/backups/sakistarsfc-<date>.json.gz
```

The file contains personal data. Store it encrypted (e.g. a password-protected drive folder
with 2-step sign-in), never in Git (the `backups/` folder is ignored), and delete old copies
you no longer need. Photos and documents live in Cloudinary; the backup keeps their references.

**Restore test** (monthly: a backup is only proven when it has been restored):

1. Create an empty test database (e.g. `sakistarsfc_restoretest` on the same cluster).
2. Restore into it:
   ```bash
   MONGODB_URI="<...>/sakistarsfc_restoretest?..." npm run backup:restore -- backups/<file>.json.gz
   ```
3. Point a local API at it and sign in; check counts in Dashboard → System.
4. Drop the test database afterwards.

**Real restore** (disaster): restore into a fresh empty database, then change `MONGODB_URI` on
Render to it. Overwriting a non-empty database needs `--replace` and typing the database name.

## 5. Data retention and deletion

| Data | Kept |
|---|---|
| Sign-in sessions | Removed automatically when expired (30 days by default) |
| Notifications | Removed automatically after 1 year |
| Contact messages | Removed automatically after 2 years |
| Audit log | Kept (accountability); included in `backup:export` |
| Deleted news, players, videos, etc. | Soft-deleted: hidden everywhere, kept for history and audit |

**A user asks to delete their account:** the user presses *Request deletion* in Account →
Privacy (they can also download their data there). The request appears in Dashboard → Users.
Staff with `users.manage` choose **Delete personal data**, type `DELETE` and a reason. This
removes name, email, contact details and private documents; club history (results, match
events) stays but is no longer linked to a person. It cannot be undone.

**Legal pages:** editing the Terms or Privacy Policy in Settings with a **new version number**
asks every signed-in user to accept the new version. Keep the old text somewhere for your records.

## 6. Incidents

- **Stolen-token alert** (Dashboard → System, or an email to the user): the user's session family
  was signed out automatically. Ask them to change their password if it happens again.
- **Suspicious staff activity:** suspend the staff member (Staff → Suspend). They are signed out
  at once. Review the Audit log filtered by that person.
- **Database password leaked:** in Atlas, change the database user's password, update
  `MONGODB_URI` on Render, redeploy.
- **`JWT_ACCESS_SECRET` leaked:** set a new value on Render and redeploy. Everyone must sign in again.
- **Cloudinary/Resend key leaked:** create a new key in that service, update Render, delete the old key.

Every API error response carries a `requestId`. Search the Render logs for it to find the details.

## 7. Updating the software

1. Run the tests locally (`npm test` and `npm run lint` in both folders).
2. `npm run backup:export` against the live database.
3. Push to the main branch; Vercel and Render redeploy automatically.
4. `npm run db:indexes` against the live database.
5. Check `/api/v1/health/ready` and sign in.

Run `npm audit` in both folders monthly and update dependencies that have security fixes.
