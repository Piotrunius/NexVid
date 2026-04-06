# NexVid

NexVid is a production-ready streaming frontend built with **Next.js 15 (App Router)**. It aggregates streams from multiple providers, offers a custom HLS player, and includes a Cloudflare Worker backend for proxying, authentication, and persistent user data.

---

## Key Concepts

### What this repository contains

- **Frontend** (Next.js): UI, routing, client state, video player, settings, and source selection.
- **Worker** (Cloudflare Workers): proxy & API layer, including CORS proxy, HLS manifest rewriting, user auth, and Cloudflare D1 persistence.

### Goals

- Provide a modern streaming UI with source aggregation.
- Enable users to save settings and watchlists in the cloud (D1).
- Keep the frontend decoupled from scraping logic by using a worker proxy.

---

## Features

- Source aggregation from built-in providers (FebBox, VixSrc, Videasy, VidLink).
- HLS.js-based player with keyboard shortcuts, quality selection, captions, and seek.
- Optional skip intro/outro via TheIntroDataBase (TIDB).
- Watchlist (Planned/Watching/Completed/Dropped/On-Hold) with import/export support.
- User settings persisted in localStorage + synchronized to Cloudflare D1.
- Cloudflare Worker proxy for CORS, HLS manifest re-writing, and authentication.
- Responsive UI with toggleable “Liquid Glass” theme and multiple accent colors.

---

## Repository layout

```
/ (root)
├── src/               # Next.js frontend (App Router)
│   ├── app/           # Pages and layouts
│   ├── components/    # Reusable UI components
│   ├── lib/           # API clients, helpers, providers
│   ├── stores/        # Zustand stores (auth/settings/watchlist/player)
│   └── types/         # TypeScript interfaces
├── worker/            # Cloudflare Worker proxy + API
│   ├── src/           # Worker source code
│   ├── schema.sql     # D1 schema
│   └── wrangler.toml  # Worker configuration
├── public/            # Static assets (images, robots.txt, etc.)
├── package.json       # Frontend dependencies and scripts
└── next.config.js     # Next.js configuration
```

---

## Prerequisites

- Node.js 20+ (recommended)
- npm 10+ (or pnpm/yarn if you prefer; this repo uses npm scripts)
- Cloudflare account (for Worker + D1)

---

## Local development

### 1) Environment variables

Copy example env file and set required values.

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_PROXY_URL=https://your-proxy.workers.dev
NEXT_PUBLIC_API_URL=https://your-worker.workers.dev
DIRECT_RESOLVER_URL=https://your-resolver.workers.dev?url=
```

#### Notes

- `NEXT_PUBLIC_PROXY_URL` is the worker proxy used for scraping sources and HLS rewriting.
- `NEXT_PUBLIC_API_URL` is the worker API endpoint used for auth/settings/watchlist.
- TMDB metadata uses a built-in public API key in the client bundle, so no env var is required.

### 2) Install dependencies

```bash
npm install
```

### 3) Start frontend

```bash
npm run dev
```

Open http://localhost:3000

---

## Cloudflare Worker (backend) setup

The worker serves two purposes:

1. **CORS proxy & stream resolver** (`/api/proxy`, `/api/hls`) for grabbing streams from external providers.
2. **API endpoints** (`/api/auth`, `/api/user/*`) backed by Cloudflare D1 for auth, settings, and watchlist.

### 1) Install worker dependencies

```bash
cd worker
npm install
```

### 2) Authenticate wrangler

```bash
npx wrangler login
```

### 3) Create or use an existing Cloudflare D1 database

```bash
npx wrangler d1 create nexvid-db
```

Then copy the generated `database_id` into `worker/wrangler.toml`.

### 4) Apply the schema

```bash
npx wrangler d1 execute nexvid-db --file=./schema.sql
```

### 5) Deploy the worker

```bash
npx wrangler deploy
```

After deployment, set `NEXT_PUBLIC_API_URL` (and optionally `NEXT_PUBLIC_PROXY_URL`) to the deployed worker URL.

---

## Key commands

### Frontend

- `npm run dev` — Start Next.js in development mode.
- `npm run build` — Build production frontend.
- `npm run start` — Run production build locally.
- `npm run lint` — Run ESLint.
- `npm run typecheck` — Run TypeScript type check.

### Worker

From `worker/`:

- `npm run dev` — Start wrangler dev server (local emulation).
- `npm run deploy` — Deploy worker to Cloudflare.
- `npm run lint` — (if configured) run lint checks for worker code.

---

## Environment variables reference

### Frontend (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_PROXY_URL` | yes | Worker proxy URL used for scraping and HLS rewriting.
| `NEXT_PUBLIC_API_URL` | yes | Worker API base URL for auth/settings/watchlist.
| `DIRECT_RESOLVER_URL` | no | Optional resolver URL for direct stream access (see below).

### Worker (`worker/.env` or `wrangler.toml`)

Worker configuration is stored in `worker/wrangler.toml`. Common settings:

| Key | Purpose |
|-----|---------|
| `name` | Worker name.
| `main` | Entry file (usually `./src/index.ts`).
| `vars` | Environment variables (if any) required by the worker.
| `d1_databases` | D1 database bindings.

---

## API endpoints (worker)

### Proxy endpoints (CORS / HLS)

| Path | Method | Purpose |
|------|--------|---------|
| `/api/health` | GET | Health check.
| `/api/proxy?url=...` | GET | Generic CORS proxy (for scraping sources).
| `/api/hls?url=...` | GET | HLS manifest proxy + rewrite to make segments load.

> Header forwarding (from frontend to upstream):
> - `X-Cookie` → `Cookie`
> - `X-Referer` → `Referer`
> - `X-Origin` → `Origin`
> - `X-User-Agent` → `User-Agent`

### Auth / user data endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/api/auth/register` | POST | Create user and session.
| `/api/auth/login` | POST | Sign in and receive bearer token.
| `/api/auth/me` | GET | Validate token and return user info.
| `/api/auth/logout` | POST | Invalidate session.
| `/api/user/settings` | GET/PUT | Read/write user settings (JSON) in D1.
| `/api/user/watchlist` | GET/PUT | Read/write user watchlist (JSON) in D1.

---

## Direct stream resolver (optional)

If some HLS sources return `403`/`401` due to CDN restrictions, you can deploy a dedicated worker resolver and set:

```env
DIRECT_RESOLVER_URL=https://your-resolver.workers.dev?url=
```

When configured, the frontend will route problematic URLs through the resolver before hitting the upstream.

---

## Notes for contributors

- The frontend is written in TypeScript and uses React Server Components where appropriate.
- State is managed with Zustand; localStorage persistence is handled via `src/stores`.
- The worker uses Cloudflare Workers runtime and Cloudflare D1 for persistence.
- Source aggregation is implemented in `src/lib/providers.ts` using built-in source resolver logic and the `/api/stream` worker endpoint.

---

## License

Private.
