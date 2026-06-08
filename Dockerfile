# syntax=docker/dockerfile:1

# --- Build stage: install deps and build the Nitro server bundle with Bun ---
FROM oven/bun:1 AS builder
WORKDIR /app

# Vite inlines VITE_* vars at build time, so the browser-facing Convex URLs must
# be known here. Point them at the PUBLIC address of the self-hosted backend
# (the URL the browser reaches, not the internal docker hostname).
ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL

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
