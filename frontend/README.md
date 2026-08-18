# GariGhor Motors — Frontend

React + Vite customer site and dealer console. Talks to the `../backend`
API for everything (inventory, leads, auth, AI chat, photo uploads).

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the printed `localhost` URL. Make sure the backend (`../backend`) is
running first — this app loads inventory from it on page load.

## Build for production

```bash
npm run build
```

Outputs static files to `dist/` — this is what gets deployed to Vercel,
Netlify, or any static host. Set `VITE_API_URL` in your hosting provider's
environment variables to your deployed backend's URL before building.

## Project structure

```
src/
  App.jsx      — the entire application (routing, all pages, all components)
  main.jsx     — React entry point, mounts App into index.html
  index.css    — minimal global reset (the app is styled inline throughout)
```
