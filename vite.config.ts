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
      rollupConfig: { external: [/^@sentry\//, RESVG] },
    }),
    tailwindcss(),
    tanstackStart(),
    ...sentryPlugins,
    viteReact(),
  ],
})

export default config
