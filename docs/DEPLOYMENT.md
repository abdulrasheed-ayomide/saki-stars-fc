# Deployment

The live setup:

```
Visitor ──► Vercel (website, client/)  ──/api/* rewrite──►  Render (API, server/)  ──►  MongoDB Atlas
                                                                  ├──► Cloudinary (media)
                                                                  └──► Resend (email)
```

The website and API share one address from the browser's point of view (Vercel forwards
`/api/*` to Render). The sign-in cookie is therefore first-party, so it works in every browser,
including Safari and in-app browsers that block third-party cookies.

Do the steps in this order. Values in `<angle brackets>` are yours to fill in.

---

## 1. MongoDB Atlas

1. Create a project and a cluster. M0 (free) works to start; M10+ adds automated backups.
2. **Database Access → Add user.** Use a long generated password. Role: *Read and write to any database*.
3. **Network Access → Add IP address.** Render's free and starter plans have no fixed outgoing
   IP, so add `0.0.0.0/0` (anywhere). The strong password is then the protection, so never share it.
   (Paid Render plans can use fixed IPs; list those instead.)
4. **Connect → Drivers** gives the connection string. Put the database name before the `?`:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/sakistarsfc?retryWrites=true&w=majority`
   URL-encode special characters in the password (`@` becomes `%40`, `#` becomes `%23`, and so on).

## 2. Cloudinary (photos, logos, gallery, private documents)

1. Create an account. From **Settings → API Keys**, note the *Cloud name*, *API key* and *API secret*.
2. Nothing else to configure: the API creates folders under `CLOUDINARY_FOLDER` (default `saki-stars`).
   Player and scouting documents are uploaded as **private** assets and are only reachable
   through short-lived signed links issued to authorised staff.

## 3. Resend (email)

1. Create an account and **add your domain** (for example `sakistarsfc.com`).
2. Add the DNS records Resend shows (SPF, DKIM, and a DMARC record such as
   `v=DMARC1; p=none; rua=mailto:<you>@<domain>`). DNS can take up to 48 hours.
3. Create an API key with *Sending access*.
4. `EMAIL_FROM` must use the verified domain, e.g. `Saki Stars <no-reply@sakistarsfc.com>`.

Without a domain you cannot send to real users (Resend's test sender only delivers to your
own address). The API refuses to start in production without `RESEND_API_KEY` and `EMAIL_FROM`,
because users could not verify their email or reset passwords.

## 4. Render (API)

1. **New → Web Service**, connect the Git repository.
2. Settings:

   | Setting | Value |
   |---|---|
   | Root Directory | `server` |
   | Runtime | Node |
   | Build Command | `npm ci --omit=dev` |
   | Start Command | `npm start` |
   | Health Check Path | `/api/v1/health` |

3. **Environment** (never put these in Git):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22` |
   | `MONGODB_URI` | your Atlas string |
   | `APP_URL` | `https://<your-site>` (the Vercel/custom domain; used in email links) |
   | `CORS_ORIGINS` | `https://<your-site>` (comma-separate several, e.g. with and without `www`) |
   | `TRUST_PROXY` | `2` (Vercel + Render in front of the API; see step 7) |
   | `JWT_ACCESS_SECRET` | 64+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `RESEND_API_KEY`, `EMAIL_FROM` | from step 3 |
   | `EMAIL_REPLY_TO`, `CONTACT_INBOX_EMAIL` | optional |
   | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from step 2 |
   | `LOG_LEVEL` | `info` |
   | `DIRECTOR_EMAIL`, `DIRECTOR_NAME`, `DIRECTOR_PASSWORD` | first admin login (see step 6); delete `DIRECTOR_PASSWORD` after the first sign-in |

   The API checks its configuration on start and stops with a list of every problem
   (placeholder text in `MONGODB_URI`, a short secret, `http://` origins, missing email settings, …).
   Read the Render log if a deploy fails.

4. Deploy. `https://<service>.onrender.com/api/v1/health` should return `{"data":{"status":"ok",…}}`
   and `/api/v1/health/ready` should report the database as connected.

> **Free plan:** the API sleeps after 15 minutes without traffic and takes 30–60 seconds to
> wake. The website shows "Connecting to the club server…" meanwhile. A paid instance avoids this.

## 5. Vercel (website)

1. In `client/vercel.json`, replace **all three** `YOUR-RENDER-SERVICE.onrender.com` with your Render
   host, then commit.
2. **Add New → Project**, import the repository.

   | Setting | Value |
   |---|---|
   | Root Directory | `client` |
   | Framework Preset | Vite |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Environment Variable | `VITE_API_BASE_URL=/api/v1` |

3. Deploy, then open `https://<your-site>/api/v1/health`. It must answer from Render through Vercel.
4. Make sure `CORS_ORIGINS` and `APP_URL` on Render match the exact address you use
   (including `https://` and `www` if you use it), then redeploy Render if you changed them.

## 6. First Director (admin) and club settings

Everyone — Director, staff, players and fans — signs in on the same `/login` page. What they
can open afterwards is decided by the server from their staff role and permissions, so there
is no separate admin login. A Director can never be created through the public Register page.

**Option A — automatic (recommended, and easiest when handing the project over).**
Set `DIRECTOR_EMAIL`, `DIRECTOR_NAME` and `DIRECTOR_PASSWORD` in Render's Environment (or in
`server/.env` locally) and deploy. When the API starts and finds **no** Director in the database,
it creates one with that email and a bcrypt-hashed password, and logs
`Club Director account is ready`. Then:

1. Sign in at `https://<your-site>/login` with that email and password.
2. Change the password in **Account → Security** if you like.
3. Delete `DIRECTOR_PASSWORD` from Render (and `server/.env`). Once a Director exists the variables
   are ignored anyway, so a restart never resets your password.

If the log says `DIRECTOR_PASSWORD was rejected`, the password broke a rule: 10+ characters,
letters and numbers, and it must not contain the part of the email before `@` or the first name.

**Option B — script, from your own computer** (also the way to recover access if every Director
is locked out):

```powershell
# Windows PowerShell, in the server folder
$env:MONGODB_URI = "<live Atlas connection string>"
npm run director:create                 # first Director
npm run director:create -- --recover    # reset a Director's password / add another
Remove-Item Env:MONGODB_URI
```

```bash
# Mac/Linux
MONGODB_URI="<live Atlas connection string>" npm run director:create
```

A variable set in the terminal takes priority over `server/.env`. Then sign in on the live
website and complete **Dashboard → Settings**: club name, logo, contact details, social links,
home page text, and the **Privacy Policy, Terms and Cookie Policy**. The legal texts must be
reviewed by the club before launch.

Run `npm run db:indexes` the same way after each deploy. The API creates missing indexes by
itself on start; this command also removes old ones and applies data repairs.

## 7. Check rate limiting sees real visitor IPs

Open **Dashboard → System** on the live site. *Your IP as the server sees it* must be your own
public IP (search "what is my IP" to compare).

- It shows an Amazon/Vercel address → increase `TRUST_PROXY` by 1.
- It shows something you could type yourself → decrease it.

This matters: if every visitor looks like Vercel, one person's failed logins would block everyone.

## 8. Custom domain

1. **Vercel → Project → Domains**: add `sakistarsfc.com` and `www.sakistarsfc.com`, set the DNS records
   Vercel shows, and pick one as primary (the other redirects).
2. On Render update `APP_URL` and `CORS_ORIGINS` to the new domain(s) and redeploy.
3. Search engines: `https://<domain>/sitemap.xml` (published content) and `https://<domain>/robots.txt`
   (keeps the dashboard, portal and account pages out of search results) are generated by the API
   from `APP_URL`. Submit the sitemap in Google Search Console.

**Optional later:** serve the API as `api.<domain>` (Render custom domain), set
`VITE_API_BASE_URL=https://api.<domain>/api/v1` on Vercel, add the site origins to `CORS_ORIGINS`,
set `TRUST_PROXY=1`, and remove the `/api` rewrite. Cookies stay first-party because both are
on the same site. This removes the extra hop through Vercel.

## 9. Launch checklist

- [ ] `/api/v1/health/ready` is OK on the live URL
- [ ] Director created; sign-in, sign-out and password reset emails arrive (check spam)
- [ ] Settings completed; legal pages reviewed by the club
- [ ] Upload a test image in Dashboard → Gallery (Cloudinary works), then delete it
- [ ] Dashboard → System shows email *Configured*, Cloudinary *Configured*, and your real IP
- [ ] `npm run backup:export` against the live database works and the file is stored off-site
- [ ] No demo data in the live database (`seed:dev` refuses to run in production)
- [ ] Atlas alerts configured (Project → Alerts), including storage close to the M0 limit
