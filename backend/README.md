# GariGhor Motors — Backend API

Express + PostgreSQL (via Prisma) backend for the GariGhor Motors showroom
site: car inventory, customer leads, JWT authentication, and an AI chat
proxy that keeps your Anthropic API key server-side.

## 1. Prerequisites

- Node.js 18 or newer (`node -v` to check)
- A running PostgreSQL server (local install, Docker, or a hosted service
  like Neon, Railway, or Supabase's Postgres)
- An Anthropic API key from https://console.anthropic.com

## 2. Install

```bash
cd garighor-backend
npm install
```

## 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in real values:

- `DATABASE_URL` — your PostgreSQL connection string
- `JWT_SECRET` — generate one with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ANTHROPIC_API_KEY` — your real key (never put this in frontend code)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the dealer login the seed script creates
- `CORS_ORIGIN` — your frontend's URL (Vite's default local URL is already filled in)

## 4. Create the database schema

```bash
npx prisma migrate dev --name init
```

This creates the `Car`, `Lead`, and `User` tables in your Postgres database.

## 5. Seed sample data

```bash
npm run seed
```

This creates one admin (dealer) account from your `.env` credentials, plus
10 sample car listings so the site isn't empty on first run.

## 6. Run the server

```bash
npm run dev
```

You should see `GariGhor backend listening on http://localhost:4000`.
Visit `http://localhost:4000/api/health` in a browser — it should return
`{"ok":true,"service":"garighor-backend"}`.

## API overview

| Method | Route                  | Access       | Purpose                              |
|--------|-------------------------|--------------|---------------------------------------|
| POST   | /api/auth/register       | Public       | Customer sign-up                      |
| POST   | /api/auth/login          | Public       | Customer & dealer login               |
| GET    | /api/auth/me             | Logged in    | Restore session on page load          |
| GET    | /api/cars                | Public       | List cars (supports filter/sort query params) |
| GET    | /api/cars/:id            | Public       | Single car detail                     |
| POST   | /api/cars                | Admin        | Add a new listing                     |
| PUT    | /api/cars/:id            | Admin        | Edit a listing                        |
| PATCH  | /api/cars/:id/status     | Admin        | Quick status change                   |
| DELETE | /api/cars/:id            | Admin        | Remove a listing                      |
| POST   | /api/leads                | Public       | Submit an enquiry / test-drive request|
| GET    | /api/leads                | Admin        | View all leads                        |
| PUT    | /api/leads/:id            | Admin        | Update lead status                    |
| POST   | /api/chat                 | Public (rate-limited) | AI assistant, backed by live inventory |
| POST   | /api/uploads               | Admin        | Upload a car photo, get back a URL    |

Admin routes require `Authorization: Bearer <token>` from the login response,
and the logged-in user must have `role: "admin"` (only the seeded account
has this by default — promote further staff accounts directly in the
database for now).

### Confirming the admin protection is real

This isn't gated by the dealer-console PIN at all — that PIN only controls
whether the *browser UI* shows the console. The actual protection is
server-side. You can prove it to yourself:

```bash
# No token — this should be rejected with 401, even though you know the PIN
curl -X POST http://localhost:4000/api/cars -H "Content-Type: application/json" -d '{}'

# With a token from a non-admin account — rejected with 403
# With a token from the seeded admin account — succeeds
```

Every handler in `cars.js` and the `GET`/`PUT` handlers in `leads.js` run
`authRequired` then `adminRequired` before touching the database — the PIN
modal in the frontend is just a convenience gate for staff, not the real
security boundary.

### Uploading a car photo

```bash
curl -X POST http://localhost:4000/api/uploads \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "image=@/path/to/photo.jpg"
```

Returns `{ "url": "http://localhost:4000/uploads/<random-name>.jpg" }`.
Files are limited to 5MB, JPEG/PNG/WEBP only, saved under a random filename
(never the original filename, to avoid path or overwrite tricks), and served
back out from `/uploads/...`. Paste the returned `url` straight into the
`image` field when creating or editing a car via `/api/cars`.

**Frontend change needed:** in `CarFormModal`, replace the "Photo URL" text
input with a file input that uploads first, then fills `form.image` with the
returned URL:

```jsx
async function handleFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const data = new FormData();
  data.append("image", file);
  const res = await fetch(`${API}/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets the multipart boundary
    body: data,
  });
  const json = await res.json();
  if (res.ok) set("image", json.url);
  else alert(json.error);
}

// in the form JSX:
<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
{form.image && <img src={form.image} alt="" style={{ width: 120, borderRadius: 8, marginTop: 8 }} />}
```

**Backing up images:** unlike the database, uploaded files live on this
server's disk under `uploads/`. Include that folder in whatever backup
routine you set up for the database — a database backup alone won't save
the photos. If you later move to multiple servers or a host with an
ephemeral filesystem, swap `multer.diskStorage` in
`src/middleware/upload.js` for an S3-compatible bucket (e.g. the
`@aws-sdk/client-s3` package) — only that one file needs to change, since
every route just calls `upload.single("image")` and reads back a URL.

## 7. Connect the frontend

In your React app, replace the two storage helper functions and the direct
Anthropic fetch call with calls to this API. A minimal version:

```js
const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}
async function apiSend(path, method, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

// Fetch inventory: const { cars } = await apiGet("/cars");
// Submit a lead:   await apiSend("/leads", "POST", { carId, name, phone, ... });
// Admin login:     const { token, user } = await apiSend("/auth/login", "POST", { email, password });
// Add a car:       await apiSend("/cars", "POST", carData, token);
// Chat:            const { reply } = await apiSend("/chat", "POST", { messages }, null);
```

Add a `.env` file to the frontend project too (`VITE_API_URL=http://localhost:4000/api`)
so the URL isn't hardcoded, and store the JWT `token` from login in memory
or `localStorage` so it survives a page refresh.

Once this is wired in, you can delete the `window.storage` shim entirely —
the backend is now the single source of truth for inventory, leads, and
accounts, and the AI assistant always answers from live database data
instead of whatever happened to be in the browser's local storage.

## 8. Backups

`npm run backup` creates one timestamped folder under `backups/` containing:
- `database.dump` — a full Postgres dump (via `pg_dump`, compressed custom format)
- `uploads.zip` — every file currently in `uploads/`
- `manifest.json` — when it was made, how many photos it contains

This requires PostgreSQL's command-line tools (`pg_dump` / `pg_restore`) to
be installed and on your PATH — you already have these if you installed
PostgreSQL locally. Check with:
```bash
pg_dump --version
```
If that fails, install the "PostgreSQL command line tools" (they usually
ship with the main PostgreSQL installer, even if you're using a hosted
database like Neon/Railway/Supabase for `DATABASE_URL`).

**Run a backup:**
```bash
npm run backup
```
Old backups beyond `BACKUP_KEEP` (default 14) are deleted automatically
after each successful run, so disk usage doesn't grow forever.

**Restore a backup** (this overwrites your current database and `uploads/`
folder — it will ask you to type `YES` to confirm):
```bash
npm run restore -- latest
# or restore a specific one:
npm run restore -- 2026-08-16T14-05-30
```

### This matters: point BACKUP_DIR off this machine

By default `BACKUP_DIR` is `./backups` — right next to the app, on the same
disk. That protects you from *deleting a car by mistake*, but not from
*this computer's drive failing*, which would take the live database, the
uploads folder, and the backups folder with it all at once.

Change `BACKUP_DIR` in `.env` to somewhere physically or logically separate:
- An external USB drive: `BACKUP_DIR="D:/GariGhorBackups"` (Windows) or
  `BACKUP_DIR="/Volumes/Backup/garighor"` (macOS)
- A folder synced by OneDrive, Google Drive, or Dropbox's desktop app —
  the sync client then carries every backup off-site automatically
- On a production server: an attached network volume, or sync backups
  out with `rclone` (supports S3, Google Drive, Backblaze, etc.) as a
  scheduled job right after `npm run backup` finishes

### Scheduling it automatically

**Windows (Task Scheduler):**
1. Open Task Scheduler → Create Basic Task
2. Trigger: Daily, pick a time (e.g. 2:00 AM)
3. Action: "Start a program"
   - Program: `npm.cmd`
   - Arguments: `run backup`
   - Start in: the full path to your `garighor-backend` folder
4. Finish — check the "Run whether user is logged on or not" box in the
   task's Properties if you want it to run even when you're not signed in

**Linux/macOS (cron), once this is deployed to a server:**
```bash
crontab -e
# add this line to run every day at 2 AM:
0 2 * * * cd /path/to/garighor-backend && /usr/bin/npm run backup >> backup.log 2>&1
```

Either way, glance at a backup folder every so often to confirm
`database.dump` and `uploads.zip` are both actually growing/updating — a
backup job that's silently been failing for months is worse than no backup
job, since it creates false confidence.

## 9. Moving to production

- Run `npx prisma migrate deploy` (not `migrate dev`) when deploying to a
  production database.
- Set `CORS_ORIGIN` to your real domain.
- Put this server behind HTTPS (most hosts — Render, Railway, Fly.io — do
  this automatically).
- Consider adding image uploads (e.g. `multer` + an S3-compatible bucket)
  instead of the current "paste an image URL" admin field.
- Consider a proper logging/monitoring setup (e.g. Sentry) before handing
  this fully over to non-technical daily use.
- **Photo storage:** set `STORAGE_DRIVER=cloudinary` (with your Cloudinary
  credentials) on any host without a persistent disk — this includes
  Render's free tier. `STORAGE_DRIVER=local` only makes sense on your own
  PC or a host with an attached persistent volume; see the deployment guide
  below for the full walkthrough.

## 10. Deploying for free (Neon + Render + Cloudinary)

This stack costs $0 and needs no credit card anywhere, and is enough for a
single showroom's real traffic. Three free accounts, in this order:

1. **Database — [neon.tech](https://neon.tech)**: sign up, create a project,
   copy the connection string it gives you — that's your `DATABASE_URL`.
   Neon's free tier doesn't expire and doesn't require a card.
2. **Photo storage — [cloudinary.com](https://cloudinary.com)**: sign up
   (free, no card), and on your dashboard's home page copy the Cloud name,
   API Key, and API Secret — those are your three `CLOUDINARY_*` values.
3. **Server — [render.com](https://render.com)**: sign up with your GitHub
   account, "New +" → "Web Service" → pick this repo's backend folder.
   - Build command: `npm install && npx prisma generate`
   - Start command: `npx prisma migrate deploy && node src/index.js`
   - Add every variable from your `.env` as an Environment Variable in
     Render's dashboard — including `STORAGE_DRIVER=cloudinary` and the
     three `CLOUDINARY_*` values. Set `PORT` to whatever Render's docs
     specify for your runtime (Render usually injects this automatically —
     you can leave your own `PORT` var out).
   - Once deployed, run the seed script once via Render's shell tab:
     `npm run seed`

Render's free web service spins down after 15 minutes of no traffic, so the
very first request after a quiet period takes about a minute to wake back
up — normal, not a bug. Free tier also resets monthly at 750 instance-hours,
which a single service running continuously fits inside easily.

Note `npm run backup` won't be useful to run *on* Render itself (the free
tier has no persistent disk to write backups to, and Neon already versions
your data). Instead, run backups from your own PC against the live
`DATABASE_URL`, or set up a scheduled GitHub Action that dumps the database
to a cloud storage bucket — ask if you'd like that built out.
