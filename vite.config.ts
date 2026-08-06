import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// @resvg/resvg-js ships a native .node binary and is only used server-side in
// the /og.png route. Rolldown chokes trying to load the binary as UTF-8, so we
// keep every dep optimizer (client + SSR) from pre-bundling it and make sure it
// stays external in the SSR and Nitro server builds (loaded as a native module
// at runtime instead). Without the SSR excludes the dev server crashes whenever
// Vite re-optimizes on a config restart.
const RESVG = '@resvg/resvg-js'

// Source-map upload to Sentry only runs when an auth token is present, so a
// normal `bun run build` is unchanged. Set SENTRY_AUTH_TOKEN (and optionally
// SENTRY_ORG / SENTRY_PROJECT) in CI/release to get readable stack traces.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const sentryPlugins = sentryAuthToken
  ? [
      sentryTanstackStart({
        org: process.env.SENTRY_ORG ?? 'litrito',
        project: process.env.SENTRY_PROJECT ?? 'javascript-tanstackstart-react',
        authToken: sentryAuthToken,
      }),
    ]
  : []

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { exclude: [RESVG] },
  ssr: {
    external: [RESVG],
    optimizeDeps: { exclude: [RESVG] },
  },
  plugins: [
    devtools(),
    // Pre-compress public assets (JS/CSS) at build time so the Bun server
    // serves .br/.gz variants — the origin was shipping them uncompressed
    // (667 KB JS, 76 KB CSS). Covers static assets only; the dynamic SSR HTML
    // document is compressed at the Traefik layer (see docker-compose.dokploy).
    nitro({
      compressPublicAssets: { gzip: true, brotli: true },
      // Non-fingerprinted files in public/ were served with NO cache-control, so
      // browsers revalidated them on every visit (PSI "use efficient cache
      // lifetimes"). They change rarely — cache 30 days. Hashed /assets/* are
      // already immutable and untouched by these rules.
      routeRules: {
        '/favicon.ico': { headers: { 'cache-control': 'public, max-age=2592000' } },
        '/favicon-32x32.png': { headers: { 'cache-control': 'public, max-age=2592000' } },
        '/apple-touch-icon.png': { headers: { 'cache-control': 'public, max-age=2592000' } },
        '/litrito-logo.webp': { headers: { 'cache-control': 'public, max-age=2592000' } },
        '/litrito-logo-128.webp': { headers: { 'cache-control': 'public, max-age=2592000' } },
        '/manifest.json': { headers: { 'cache-control': 'public, max-age=86400' } },
        // SSR cache for SEO-heavy pages. CNE data updates once daily (~6pm),
        // so 12h stale-while-revalidate means the first request warms the
        // cache and every subsequent hit (including link re-checks during
        // audits with 50+ concurrent workers) is instant. SWR ensures the
        // stale cache is served while PostgreSQL-backed SSR regenerates it.
        //
        // These keyspaces are bounded: /estado/** is the ~1.5k paths the
        // sitemap lists, /metricas is one. `storage.cache` below keeps the
        // entries off the heap.
        //
        // `/explorar` is deliberately NOT cached. The cache key includes the
        // query string, and that page's filters make the keyspace unbounded —
        // any visitor appending `?anything=N` mints a fresh entry, so it was an
        // unauthenticated way to fill the container's memory. It also gained
        // little: the TTL was 120s on a page people drive with filters.
        '/estado/**': { swr: 43200 },
        '/metricas': { swr: 43200 },
      },
      // Nitro's route cache defaults to in-memory storage, which put every
      // rendered page in the same 1 GiB cgroup as the server. Measured against
      // production, one cached /estado page cost ~334 KB of heap (a ~150 KB HTML
      // document held as a UTF-16 string), so a crawler walking the sitemap's
      // ~1.5k URLs was enough to reach the limit and get the container
      // OOM-killed. On disk the same entries cost their byte size and the heap
      // stays flat.
      storage: {
        cache: { driver: 'fs', base: './.cache/nitro' },
      },
      rollupConfig: { external: [/^@sentry\//, RESVG] },
    }),
    tailwindcss(),
    tanstackStart(),
    ...sentryPlugins,
    viteReact(),
  ],
})

export default config
