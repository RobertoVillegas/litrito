# Litrito

Litrito is a TanStack Start app for comparing gasoline prices in Mexico by
station, municipality, and state. It uses Convex for data, Better Auth for
accounts, Tailwind CSS for styling, and Nitro/Bun for the production server.

## Requirements

- Bun 1.x
- A Convex deployment or local Convex dev server
- The environment variables from `.env.example`

## Development

```bash
bun install
bun run dev
```

The web app runs on `http://localhost:3000`.

Run Convex separately when working on backend functions:

```bash
bunx --bun convex dev
```

## Quality Checks

```bash
bun run type-check
bun run test
bun run build
```

Use the combined check before pushing broad changes:

```bash
bun run check
```

`build` runs `prebuild`, which regenerates:

- `public/og-image.png`
- `public/sitemap.xml`

The sitemap script queries Convex when available and falls back safely when it
cannot reach the deployment.

## Production

```bash
bun run build
bun run start
```

The production server is emitted to `.output/server/index.mjs`.

Required app environment variables:

```txt
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CONVEX_SITE_URL=https://<deployment>.convex.site
VITE_APP_DOMAIN=https://<your-domain>
BETTER_AUTH_SECRET=<generated-secret>
SITE_URL=https://<your-domain>
```

Set the auth values in Convex as well:

```bash
bunx --bun convex env set BETTER_AUTH_SECRET <generated-secret>
bunx --bun convex env set SITE_URL https://<your-domain>
```

Deploy Convex functions and crons with:

```bash
bunx --bun convex deploy
```

For self-hosting details, see `SELFHOST.md`.

## Project Layout

- `src/routes`: TanStack Router pages and API routes.
- `src/components`: shared UI and product components.
- `src/components/ui`: reusable low-level primitives.
- `src/lib`: client/server helpers and browser state.
- `src/integrations`: framework integration glue.
- `convex`: schema, queries, mutations, actions, crons, and email.
- `scripts`: build-time data and asset generation.

## Dependency Policy

This project uses Bun and commits `bun.lock`. Avoid floating `latest` ranges in
`package.json`; pin framework and runtime packages intentionally, then update
them through a normal install plus `bun run check`.
