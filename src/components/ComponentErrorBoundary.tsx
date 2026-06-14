import type { ReactNode } from 'react'
import * as Sentry from '@sentry/tanstackstart-react'
import { RotateCw } from 'lucide-react'
import { logger, errorFields } from '#/lib/logger'

// Component-level error boundary: isolates a failure to one piece of the UI so
// the rest of the page keeps working instead of blanking out. Reports the error
// to Sentry (tagged with `name` and any extra `context`) and logs it to the
// console with the same data. Works even when Sentry is disabled — the capture
// is just a no-op, but the local fallback still renders.
//
// Use it around anything that can throw on its own (maps, charts, embeds):
//   <ComponentErrorBoundary name="station-map" context={{ points }}>
//     <StationMap ... />
//   </ComponentErrorBoundary>
export function ComponentErrorBoundary({
  name,
  context,
  fallback,
  children,
}: {
  name: string
  context?: Record<string, unknown>
  fallback?: ReactNode
  children: ReactNode
}) {
  return (
    <Sentry.ErrorBoundary
      beforeCapture={(scope, error) => {
        scope.setTag('component', name)
        if (context) scope.setContext('component_context', context)
        logger.error('component error boundary caught', {
          component: name,
          ...context,
          ...errorFields(error),
        })
      }}
      fallback={({ resetError }) =>
        fallback ? (
          <>{fallback}</>
        ) : (
          <DefaultComponentFallback onRetry={resetError} />
        )
      }
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}

function DefaultComponentFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-md border border-line bg-white p-6 text-center">
      <p className="text-sm font-bold text-ink">No pudimos cargar esta sección</p>
      <p className="max-w-xs text-xs text-body">
        Ocurrió un error aquí, pero el resto de la página sigue funcionando.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-bold text-white hover:bg-ink/90"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Reintentar
      </button>
    </div>
  )
}
