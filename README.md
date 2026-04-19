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

- Source aggregation from built-in providers (Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Theta, Kappa, Omega).
- HLS.js-based player with keyboard shortcuts, quality selection, captions, and seek.
- Optional skip intro/outro via TheIntroDataBase (TIDB).
- Watchlist (Planned/Watching/Completed/Dropped/On-Hold) with import/export support.
- User settings persisted in localStorage + synchronized to Cloudflare D1.
- Cloudflare Worker proxy for CORS, HLS manifest re-writing, and authentication.
- Responsive UI with toggleable “Liquid Glass” theme and multiple accent colors.

### Source Map

| Display Name | Internal ID         | Type              | Remote Link / Source Target      |
| ------------ | ------------------- | ----------------- | -------------------------------- |
| Alpha        | `febbox`            | Direct (Best)     | _FebBox API (Requires Token)_    |
| Beta         | `pobreflix`         | Direct (Best)     | `https://pobreflix.codes`        |
| Gamma        | `02moviedownloader` | Direct (Best)     | `https://02moviedownloader.site` |
| Delta        | `zxcstream`         | Embed (Safe)      | `https://zxcstream.xyz`          |
| Epsilon      | `cinesrc`           | Embed (Safe)      | `https://cinesrc.st`             |
| Sigma        | `peachify`          | Embed (Unsafe)    | `https://peachify.top`           |
| Eeta         | `vidfast`           | Embed (Unsafe)    | `https://vidfast.pro`            |
| Theta        | `videasy`           | Embed (Unsafe)    | `https://videasy.net`            |
| Iota         | `vidsync`           | Embed (Dangerous) | `https://vidsync.xyz`            |
| Kappa        | `vidlink`           | Embed (Dangerous) | `https://vidlink.pro`            |

---

## Repository layout

```
/ (root)
├── src/                # Next.js frontend (App Router)
│   ├── app/            # Pages and layouts
│   ├── components/     # Reusable UI components
│   ├── lib/            # API clients, helpers, providers
│   ├── stores/         # Zustand stores (auth/settings/watchlist/player)
│   └── types/          # TypeScript interfaces
├── worker/             # Cloudflare Worker proxy + API
│   ├── src/            # Worker source code
│   ├── schema.sql      # D1 schema
│   └── wrangler.toml   # Worker configuration
├── public/             # Static assets (images, llms.txt, etc.)
├── scripts/            # Repo helper scripts
├── .eslintrc.json      # ESLint config
├── next.config.js      # Next.js configuration
├── package.json        # Frontend dependencies and scripts
├── bun.lock            # Bun lockfile (if using bun)
├── package-lock.json   # npm lockfile
├── postcss.config.js   # PostCSS config
├── tailwind.config.js  # Tailwind CSS config
├── tsconfig.json       # TypeScript config
└── README.md           # Project README
```

---

## Prerequisites

- Node.js 20+ (recommended)
- Bun (optional, but recommended for faster installs and scripts)
- npm or yarn (if not using Bun)
- Cloudflare account (for Worker + D1)
- API tokens for any providers that require them (e.g. FebBox)
- Wrangler CLI for Cloudflare Worker development

---

## Local development

### 1) Environment variables

Copy example env file and set required values.

```bash
cp .env.example .env.local
```

Edit `.env.local`:

### 2) Install dependencies

```bash
bun install
```

### 3) Start frontend

```bash
bun run dev
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
bun install
```

### 2) Authenticate wrangler

```bash
bunx wrangler login
```

### 3) Create or use an existing Cloudflare D1 database

```bash
bunx wrangler d1 create nexvid-db
```

Then copy the generated `database_id` into `worker/wrangler.toml`.

### 4) Apply the schema

```bash
bunx wrangler d1 execute nexvid-db --file=./schema.sql
```

### 5) Deploy the worker

```bash
bunx wrangler deploy
```

After deployment, set `API_URL` (and optionally `NEXT_PUBLIC_PROXY_URL`) to the deployed worker URL.

---

## Key commands

### Frontend

- `bun run dev` — Start Next.js in development mode.
- `bun run build` — Build production frontend.
- `bun run start` — Run production build locally.
- `bun run lint` — Run ESLint.

### Worker

From `worker/`:

- `bun run dev` — Start wrangler dev server.
- `bun run lint` — Run lint checks for worker code.

### Both

- `bun run ship` — Run lint, typecheck, build for frontend and deploy both frontend and worker.
- `bun run format` — Format all code with Prettier.

---

## API endpoints (worker)

### Proxy endpoints (CORS / HLS)

| Path                 | Method | Purpose                                             |
| -------------------- | ------ | --------------------------------------------------- |
| `/api/health`        | GET    | Health check.                                       |
| `/api/proxy?url=...` | GET    | Generic CORS proxy (for scraping sources).          |
| `/api/hls?url=...`   | GET    | HLS manifest proxy + rewrite to make segments load. |

> Header forwarding (from frontend to upstream):
>
> - `X-Cookie` → `Cookie`
> - `X-Referer` → `Referer`
> - `X-Origin` → `Origin`
> - `X-User-Agent` → `User-Agent`

### Auth / user data endpoints

| Path                  | Method  | Purpose                                 |
| --------------------- | ------- | --------------------------------------- |
| `/api/auth/register`  | POST    | Create user and session.                |
| `/api/auth/login`     | POST    | Sign in and receive bearer token.       |
| `/api/auth/me`        | GET     | Validate token and return user info.    |
| `/api/auth/logout`    | POST    | Invalidate session.                     |
| `/api/user/settings`  | GET/PUT | Read/write user settings (JSON) in D1.  |
| `/api/user/watchlist` | GET/PUT | Read/write user watchlist (JSON) in D1. |

---

## Notes for contributors

- The frontend is written in TypeScript and uses React Server Components where appropriate.
- State is managed with Zustand; localStorage persistence is handled via `src/stores`.
- The worker uses Cloudflare Workers runtime and Cloudflare D1 for persistence.
- Source aggregation is implemented in `src/lib/providers.ts` using built-in source resolver logic and the `/api/stream` worker endpoint.

---
