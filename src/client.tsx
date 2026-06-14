// Sentry initialization must be the first import so it's set up before any
// other code runs (and before hydration). Everything below mirrors the
// TanStack Start default client entry.
import './instrument.client'

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
