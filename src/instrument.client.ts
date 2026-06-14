// Sentry client initialization. Imported first in src/client.tsx so errors and
// breadcrumbs are captured even before hydration. The DSN is a public client
// key (safe to ship); override per-environment with VITE_SENTRY_DSN. Disabled
// in dev by default to avoid flooding the project with HMR/optimizer noise —
// set VITE_SENTRY_FORCE=1 to test locally (e.g. the "Break the world" button).
import * as Sentry from '@sentry/tanstackstart-react'

const DSN =
  (import.meta.env.VITE_SENTRY_DSN as string | undefined) ??
  'https://4b2523cbe1d46df49df73c6b3c5dec6f@o4511566134837248.ingest.us.sentry.io/4511566135951360'

Sentry.init({
  dsn: DSN,
  enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_FORCE === '1',
  environment: import.meta.env.MODE,
  // Keep a light trace sample; bump if you want more performance data.
  tracesSampleRate: 0.1,
  // Don't attach IPs / user identifiers by default.
  sendDefaultPii: false,
})
