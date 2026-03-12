# NexVid – Frontend

Production-ready streaming website frontend built with **Next.js 15**, featuring source aggregation from 48+ providers, a custom video player, and Apple-style Liquid Glass UI.

## Features

- **Source Aggregation** – Scans 48+ sources & 60+ embed providers simultaneously via `@p-stream/providers`
- **Custom Video Player** – HLS.js-based player with keyboard shortcuts, quality selection, captions panel
- **Liquid Glass UI** – Apple-style frosted glass theme (toggleable) with 6 accent colors
- **TIDB Integration** – Skip intro/outro buttons via TheIntroDataBase
- **Watchlist** – Planned / Watching / Completed / Dropped / On-Hold statuses with import/export
- **Authentication + Cloud Sync** – Worker API with Cloudflare D1 storage (users, settings, watchlist)
- **Cloudflare Worker Proxy/API** – CORS proxy, HLS playlist rewriting, auth & user data API
- **Full Responsive Design** – Works on mobile, tablet, desktop
- **Dark/Light Themes** – With 6 accent color options

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.7 |
| Styling | Tailwind CSS 3.4 |
| State | Zustand 5 (persisted) |
| Video | HLS.js |
| Animations | Framer Motion |
| Icons | Inline SVG |
| Proxy | Cloudflare Workers |

## Quick Start

### 1. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_TMDB_API_KEY=your_tmdb_api_key_here
NEXT_PUBLIC_PROXY_URL=https://your-proxy.workers.dev
NEXT_PUBLIC_API_URL=https://your-worker.workers.dev
NEXT_PUBLIC_DEV_MODE=true  # Enable mock sources for development
```

Get a free TMDB API key at [themoviedb.org](https://www.themoviedb.org/settings/api).

### 2. Install & Run

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### 3. Cloudflare D1 + Worker API

Create D1 and apply schema:

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create nexvid-db
# copy database_id into worker/wrangler.toml
npx wrangler d1 execute nexvid-db --file=./schema.sql
```

Deploy worker:

```bash
npx wrangler deploy
```

Then set `NEXT_PUBLIC_API_URL` to your worker URL in `.env.local`.

## Project Structure

```
pstream-frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Homepage (trending, popular, top rated)
│   │   ├── browse/page.tsx     # Browse with genre filters
│   │   ├── search/page.tsx     # Search movies & shows
│   │   ├── movie/[id]/page.tsx # Movie details
│   │   ├── show/[id]/page.tsx  # Show details with episode list
│   │   ├── watch/[type]/[id]/  # Watch page with player
│   │   ├── settings/page.tsx   # Full settings panel
│   │   ├── login/page.tsx      # Login/Register
│   │   └── list/page.tsx       # Watchlist management
│   ├── components/
│   │   ├── layout/Navbar.tsx   # Glass navigation bar
│   │   ├── media/MediaCard.tsx # Cards, rows, skeletons
│   │   ├── player/
│   │   │   ├── VideoPlayer.tsx # Custom HLS player
│   │   │   └── SourceSelector.tsx
│   │   ├── providers/ThemeProvider.tsx
│   │   └── ui/Toaster.tsx
│   ├── lib/
│   │   ├── tmdb.ts             # TMDB API client
│   │   ├── providers.ts        # Source scraping integration
│   │   ├── cloudSync.ts        # Cloudflare auth/settings/watchlist sync
│   │   ├── tidb.ts             # TheIntroDataBase client
│   │   └── utils.ts            # cn(), tmdbImage(), etc.
│   ├── stores/
│   │   ├── settings.ts         # User preferences (persisted)
│   │   ├── auth.ts             # Authentication state
│   │   ├── watchlist.ts        # Watchlist management
│   │   └── player.ts           # Playback state
│   └── types/index.ts          # All TypeScript interfaces
├── worker/                     # Cloudflare Worker proxy + API
│   ├── src/index.ts            # CORS proxy + HLS + auth/settings/watchlist
│   ├── schema.sql              # D1 schema
│   ├── wrangler.toml
│   └── package.json
├── globals.css                 # Liquid Glass theme system
└── package.json
```

## Settings

All settings are persisted in localStorage:

| Setting | Options | Default |
|---------|---------|---------|
| Theme | Dark / Light | Dark |
| Accent Color | Indigo, Violet, Rose, Emerald, Amber, Cyan | Indigo |
| Glass Effect | On / Off | On |
| Default Quality | Auto, 4K, 1080p, 720p, 480p, 360p | 1080p |
| Auto-play | On / Off | On |
| Auto Next Episode | On / Off | On |
| Skip Intro (TIDB) | On / Off | On |
| Skip Outro (TIDB) | On / Off | On |
| Disable Transparency | On / Off | Off |

## Keyboard Shortcuts (Player)

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `F` | Toggle Fullscreen |
| `M` | Toggle Mute |
| `←` | Seek -10s |
| `→` | Seek +10s |
| `↑` | Volume +5% |
| `↓` | Volume -5% |

## Development Mode

Set `NEXT_PUBLIC_DEV_MODE=true` in `.env.local` to enable mock sources. This returns a Mux test HLS stream and Big Buck Bunny for testing the player without a real proxy.

## Proxy Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /proxy?url=...` | CORS proxy with header forwarding |
| `GET /hls?url=...` | HLS manifest proxy with URL rewriting |

Headers forwarded: `X-Cookie` → `Cookie`, `X-Referer` → `Referer`, `X-Origin` → `Origin`, `X-User-Agent` → `User-Agent`.

## Worker API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Create user and session |
| `/auth/login` | POST | Sign in and return bearer token |
| `/auth/me` | GET | Validate token and fetch current user |
| `/auth/logout` | POST | Invalidate current session |
| `/user/settings` | GET/PUT | Read/write user settings JSON in D1 |
| `/user/watchlist` | GET/PUT | Read/write watchlist JSON in D1 |

## Direct Stream Resolver (No-Embed)

If direct HLS URLs return `403` from upstream CDNs, deploy a dedicated Cloudflare Worker resolver and set:

```env
NEXT_PUBLIC_DIRECT_RESOLVER_URL=https://your-resolver.workers.dev?url=
```

in Cloudflare Pages: **Settings → Functions → Variables**.

### Deploy quick steps

1. Create/deploy a resolver Worker (for example `my-resolver`).
2. Copy Worker URL (for example `https://my-resolver.<account>.workers.dev`).
3. Set `NEXT_PUBLIC_DIRECT_RESOLVER_URL=https://my-resolver.<account>.workers.dev?url=` in Pages variables.
4. Re-deploy Pages project.

`/api/hls-proxy` automatically uses this resolver as fallback when upstream returns `401/403/429`.

## License

Private – Not for redistribution.
# NexVid
