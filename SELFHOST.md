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
bunx convex run ingestion:bootstrapNationalRefresh    # states + municipalities + national prices (queues ~2,500 jobs; runs hours in bg)
bunx convex run ingestion:refreshPlaces               # coordinates (fast, XML match against known stations)
bunx convex run listings:backfillStationListings      # materialized public read model (first install / repair)
bunx convex run stations:rebuildFilterOptionsCache    # filter counts snapshot
```

The daily crons keep prices/coordinates fresh after this. `bootstrapNationalRefresh` is the
single entry point that pulls the catalog, snapshots the XML feeds, and advances a
durable self-chaining worker one municipality at a time. Each municipality loads
its indexed station and current-price working sets in bulk, keeping isolate memory
and database operations bounded while the public queries remain responsive. The
queue persists its cursor, failure count, new-station count, and heartbeat; a
15-minute watchdog resumes an abandoned worker from the last committed cursor.

Public list, map, nearby, and export queries read `stationListings`, a denormalized
projection maintained transactionally with station, current-price, coordinate,
and enrichment writes. Run the listing backfill after adding the table to an
existing deployment, then verify it with:

```bash
bunx convex run listings:getBackfillStatus
```

After each national refresh, maintenance runs as one chain: match the places XML
only for newly discovered stations, rebuild filter options, rebuild metrics, and
finally geocode any remaining pending stations. Do not add overlapping fixed
crons for those stages.

## 7. Build + run the web app

```bash
docker compose --profile web up -d --build web
# on a VPS:
docker compose --env-file .env.selfhost --profile web up -d --build web
```

App: `http://127.0.0.1:3000`. The browser-facing Convex URLs are baked into the
build from `CONVEX_CLOUD_ORIGIN` / `CONVEX_SITE_ORIGIN`, so rebuild the `web`
image if those change.

## Deploy with Dokploy (Traefik)

Use **`docker-compose.dokploy.yml`** instead of the local compose. It declares
only the services, ports, env and the data volume — Dokploy injects
`dokploy-network` and the Traefik labels, and you add the domains from the
Dokploy **Domains** UI. No host port bindings.

Use **single-level** subdomains so a `*.athas.mx` wildcard cert covers them (a
wildcard matches one level only).

1. **DNS**: point four single-level subdomains at the VPS (already covered by
   your `*.athas.mx` wildcard), e.g. `litrito`, `litrito-convex`,
   `litrito-convex-http`, `litrito-convex-admin`.
2. **Dokploy → Compose service** pointing at this repo / `docker-compose.dokploy.yml`.
   Set the env vars from `.env.selfhost` in the Dokploy service settings.
3. **Dokploy → Domains**: route each domain to its service + container port:

   | Domain | Service | Port |
   |---|---|---|
   | `litrito.athas.mx` | `web` | 3000 |
   | `litrito-convex.athas.mx` | `backend` | 3210 (API + websocket) |
   | `litrito-convex-http.athas.mx` | `backend` | 3211 (HTTP actions) |
   | `litrito-convex-admin.athas.mx` | `dashboard` | 6791 |

   The `backend` service gets **two** domains (3210 and 3211).
4. **Deploy.** The `web` service builds and runs, but errors until functions are
   deployed (next).
5. **Admin key** — in the backend container's terminal (Dokploy → backend → Terminal):
   ```bash
   ./generate_admin_key.sh
   ```
6. **From your laptop**, target the VPS backend in `.env.local`:
   ```bash
   CONVEX_SELF_HOSTED_URL='https://litrito-convex.athas.mx'
   CONVEX_SELF_HOSTED_ADMIN_KEY='<admin key>'
   # comment out the old cloud CONVEX_DEPLOYMENT
   ```
   Then push schema + functions and set the app URL:
   ```bash
   bunx convex deploy
   bunx convex env set SITE_URL https://litrito.athas.mx
   ```
7. **Repopulate — Zacatecas first to test fast:**
   ```bash
   bunx convex run ingestion:bootstrapNationalRefresh  # states + municipalities + queues all prices
   bunx convex run ingestion:refreshPlaces             # coordinates (national, fast)
   bunx convex run ingestion:refreshMunicipalityNow '{"stateExternalId":"32","municipalityExternalId":"056"}'
   bunx convex run listings:backfillStationListings     # required once after introducing the read model
   bunx convex run stations:rebuildFilterOptionsCache  # filter counts
   ```
   Then the rest of the country in the background when ready:
   ```bash
   bunx convex run ingestion:bootstrapNationalRefresh
   ```
8. Redeploy the compose in Dokploy if you change `CONVEX_DOMAIN`/`CONVEX_HTTP_DOMAIN`
   (the web bundle bakes those URLs at build time).

> Prefer not to expose the dashboard publicly? Just don't add a domain for the
> `dashboard` service in Dokploy and reach it through a Dokploy terminal / SSH
> port-forward instead.

## VPS notes

- Put the backend (3210), HTTP actions (3211) and the app (3000) behind a reverse
  proxy (Caddy/nginx) with TLS, and set `CONVEX_CLOUD_ORIGIN` / `CONVEX_SITE_ORIGIN`
  to the public HTTPS URLs before deploying so the browser can reach them.
- Set a strong `INSTANCE_SECRET` in `.env.selfhost`.
- Back up the `convex_data` volume (or your Postgres database) regularly — you own
  durability now, not Convex Cloud.
- The self-hosted backend is single-node and "not optimized for scale" like the
  cloud, which is fine for a workload this size.
