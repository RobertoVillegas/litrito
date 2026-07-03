import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { captureError } from '#/lib/report'

// Component-level error boundary: isolates a failure to one piece of the UI so
// the rest of the page keeps working instead of blanking out. Reports the error
// to Sentry (tagged with `name` and any extra `context`) and logs it to the
// console with the same data. Sentry is loaded lazily via captureError, so this
// component doesn't pull the SDK into the initial bundle; the local fallback
// renders regardless of whether Sentry is enabled.
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
    <ErrorBoundary
      name={name}
      context={context}
      renderFallback={(retry) =>
        fallback ? <>{fallback}</> : <DefaultComponentFallback onRetry={retry} />
      }
    >
      {children}
    </ErrorBoundary>
  )
}

// Minimal class-based error boundary. Replaces Sentry.ErrorBoundary (which would
// have forced the SDK into the initial bundle) with the same behavior: catch,
// report via the lazy captureError, render a recoverable fallback, and reset.
class ErrorBoundary extends Component<
  {
    name: string
    context?: Record<string, unknown>
    renderFallback: (retry: () => void) => ReactNode
    children: ReactNode
  },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    captureError(error, {
      logMessage: 'component error boundary caught',
      tags: { component: this.props.name },
      extra: this.props.context,
    })
  }

  reset = () => this.setState({ hasError: false })

  render() {
    if (this.state.hasError) return this.props.renderFallback(this.reset)
    return this.props.children
  }
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
        <RefreshCw className="h-3.5 w-3.5" />
        Reintentar
      </button>
    </div>
  )
}
