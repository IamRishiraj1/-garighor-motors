# GariGhor Motors (গাড়ি ঘর)

Full-stack website for a reconditioned car showroom: a customer-facing
catalog and enquiry system, a dealer admin console, and an AI shopping
assistant — plus the backend API, database, and photo storage behind them.

## What's in this repo

```
frontend/   React + Vite site (customers) and dealer console (admin)
backend/    Express API + PostgreSQL (via Prisma) + JWT auth + AI chat proxy
```

Each folder has its own README with full setup instructions. Start with
`backend/README.md` — the frontend needs the API running to show anything.

## Quick start (local development)

1. `backend/` — follow `backend/README.md`: install deps, set up `.env`,
   create the database, seed sample data, `npm run dev` (runs on :4000)
2. `frontend/` — follow `frontend/README.md`: install deps, set
   `VITE_API_URL=http://localhost:4000/api` in `.env.local`, `npm run dev`
   (runs on :5173)
3. Open the frontend URL. Log in with the admin credentials you set in
   `backend/.env` to access the dealer console (a "Dealer console" link
   appears in the header once logged in as that account).

## Deploying for free

See the "Deploying for free" section in `backend/README.md` for the full
walkthrough: a free PostgreSQL database (Neon), free photo storage
(Cloudinary), and free API hosting (Render). The frontend deploys separately
to Vercel or Netlify as a static build.

## Handing this project over

If you received this repository as a finished project, see
`HANDOVER.md` in this folder for a plain-language guide to running the
business day-to-day (adding cars, managing enquiries, changing the admin
password) without needing to read any code.
