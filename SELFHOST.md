# Self-hosting Litrito

Run the whole stack — the open-source [Convex backend](https://github.com/get-convex/convex-backend),
the Convex dashboard, and the web app — on your own machine or VPS with one
`docker-compose.yml`. No managed quotas; you only pay for the box.

By default the backend stores everything in a bundled **SQLite** database (on
the `convex_data` volume). You can point it at **Postgres** or **MySQL** instead
— see the optional block in `docker-compose.yml` / `.env.selfhost.example`.

## Prerequisites

- Docker + Docker Compose
- Bun (only to run the `npx convex` CLI locally for deploys): `npm i -g convex` works too

## 1. Start the backend + dashboard

```bash
# local trial (defaults to http://127.0.0.1:3210)
docker compose up -d backend dashboard

# on a VPS, set your public URLs first
cp .env.selfhost.example .env.selfhost   # edit CONVEX_CLOUD_ORIGIN / CONVEX_SITE_ORIGIN
docker compose --env-file .env.selfhost up -d backend dashboard
```

- Backend API: `http://127.0.0.1:3210`
- HTTP actions (auth, `/stations/export`): `http://127.0.0.1:3211`
- Dashboard: `http://127.0.0.1:6791`

## 2. Generate an admin key

```bash
docker compose exec backend ./generate_admin_key.sh
```

## 3. Point the CLI at the self-hosted backend

In `.env.local` (used by `npx convex`):

```bash
CONVEX_SELF_HOSTED_URL='http://127.0.0.1:3210'   # or your public CONVEX_CLOUD_ORIGIN
CONVEX_SELF_HOSTED_ADMIN_KEY='<admin key from step 2>'
```

> Comment out the old cloud `CONVEX_DEPLOYMENT` line while self-hosting so the CLI
> targets the right backend.

## 4. Deploy functions + schema

```bash
bunx convex deploy
```

This pushes the schema, functions, components (better-auth) and crons. No code
changes needed — same source that ran on Convex Cloud.

## 5. Set deployment env vars

```bash
# Public URL of the web app, used by better-auth for trusted origins / redirects
bunx convex env set SITE_URL http://127.0.0.1:3000   # or https://litrito.mx
```

## 6. Populate the data

```bash
bunx convex run ingestion:refreshCatalog              # states + municipalities
bunx convex run ingestion:refreshPlaces               # coordinates (fast, XML match)
bunx convex run ingestion:bootstrapNationalRefresh    # national prices (runs ~hours in bg)
bunx convex run stations:rebuildFilterOptionsCache    # filter counts snapshot
```

The daily crons keep prices/coordinates fresh after this.

## 7. Build + run the web app

```bash
docker compose --profile web up -d --build web
# on a VPS:
docker compose --env-file .env.selfhost --profile web up -d --build web
```

App: `http://127.0.0.1:3000`. The browser-facing Convex URLs are baked into the
build from `CONVEX_CLOUD_ORIGIN` / `CONVEX_SITE_ORIGIN`, so rebuild the `web`
image if those change.

## VPS notes

- Put the backend (3210), HTTP actions (3211) and the app (3000) behind a reverse
  proxy (Caddy/nginx) with TLS, and set `CONVEX_CLOUD_ORIGIN` / `CONVEX_SITE_ORIGIN`
  to the public HTTPS URLs before deploying so the browser can reach them.
- Set a strong `INSTANCE_SECRET` in `.env.selfhost`.
- Back up the `convex_data` volume (or your Postgres database) regularly — you own
  durability now, not Convex Cloud.
- The self-hosted backend is single-node and "not optimized for scale" like the
  cloud, which is fine for a workload this size.
