import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

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

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { exclude: [RESVG] },
  ssr: {
    external: [RESVG],
    optimizeDeps: { exclude: [RESVG] },
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//, RESVG] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
