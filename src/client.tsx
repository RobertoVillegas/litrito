import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  )
})

// Load + init Sentry AFTER hydration, off the critical path, so the browser SDK
// (~40 KB gzip) stays out of the initial bundle — it was previously the first
// static import, pinning it to the critical path. Errors are still caught by the
// route/component ErrorBoundaries; only the brief pre-init window goes
// unreported to Sentry. Importing the module runs Sentry.init() at load.
if (typeof window !== 'undefined') {
  const loadSentry = () => {
    void import('./instrument.client')
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(loadSentry, { timeout: 3000 })
  } else {
    setTimeout(loadSentry, 2000)
  }
}
