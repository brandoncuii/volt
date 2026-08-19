# Volt client

React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui (Nova) frontend for the
Volt EV trip planner.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and add VITE_GOOGLE_MAPS_API_KEY (and optional VITE_CLERK_PUBLISHABLE_KEY)
```

## Run

```bash
npm run dev   # http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend at `http://localhost:3001`.

## Build

```bash
npm run build
```

## Notes

- Google Maps SDK and Places autocomplete are loaded with `VITE_GOOGLE_MAPS_API_KEY`.
- Clerk auth is optional. Set `VITE_CLERK_PUBLISHABLE_KEY` to enable saved trips
  and favorites; without it the route planner still works.
