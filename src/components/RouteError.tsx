import { useEffect } from 'react'
import * as Sentry from '@sentry/tanstackstart-react'
import { logger, errorFields } from '#/lib/logger'

// Shared route error fallback. Logs structured context (which screen, what was
// being viewed/filtered, the error) so failures are debuggable, and renders a
// recoverable message instead of letting the error bubble to the root and blank
// the page. Used as the `errorComponent` on each route.
export function RouteErrorFallback({
  error,
  reset,
  screen,
  context,
}: {
  error: Error
  reset?: () => void
  screen: string
  context?: Record<string, unknown>
}) {
  useEffect(() => {
    logger.error('route render failed', {
      screen,
      ...context,
      ...errorFields(error),
    })
    Sentry.captureException(error, {
      tags: { screen },
      extra: context,
    })
  }, [error, screen, context])

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-6xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="font-display text-3xl text-ink">Algo salió mal</h2>
      <p className="max-w-md text-sm text-body">
        No pudimos cargar esta pantalla. Puedes reintentar; si el problema
        persiste, intenta de nuevo en un momento.
      </p>
      {reset && (
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-white hover:bg-ink/90"
        >
          Reintentar
        </button>
      )}
    </main>
  )
}
