# syntax=docker/dockerfile:1

# --- Build stage: install deps and build the Nitro server bundle with Bun ---
FROM oven/bun:1 AS builder
WORKDIR /app

# Umami analytics, inlined at build time (also passed at runtime via compose).
ARG VITE_UMAMI_WEBSITE_ID
ARG VITE_UMAMI_SRC
ENV VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_SRC=$VITE_UMAMI_SRC

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# --- Runtime stage: run with Bun, matching the Bun server preset Nitro emits
# when the build runs under Bun (the output uses Bun.serve). ---
FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# Standalone ingestion worker. It intentionally does not contain or start the
# Nitro web bundle, so its 512 MiB cgroup cannot take the public site down.
FROM oven/bun:1-slim AS ingestion
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY tsconfig.json ./tsconfig.json
COPY scripts/ingest ./scripts/ingest
COPY src/db ./src/db
COPY src/features/ingestion ./src/features/ingestion
COPY src/lib/slug.ts ./src/lib/slug.ts
CMD ["bun", "scripts/ingest/main.ts"]

# Schema migrations. The `migrate` compose service runs this to completion on
# every redeploy, before `web` and `ingestion` are allowed to start. It also
# carries set-admin.ts so admin grants can be run against the live database.
FROM oven/bun:1-slim AS migration
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts/set-admin.ts ./scripts/
COPY src/db ./src/db
CMD ["bun", "run", "db:migrate"]
