import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import * as Sentry from '@sentry/tanstackstart-react'
import { ComponentErrorBoundary } from '../components/ComponentErrorBoundary'

// Internal, non-indexed page to verify Sentry end to end. Robots noindex +
// not referenced anywhere, so it won't be crawled or linked. Safe to keep
// around; delete whenever you're done testing.
export const Route = createFileRoute('/debug-sentry')({
  head: () => ({
    meta: [
      { title: 'Debug Sentry · Litrito' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: DebugSentry,
})

function DebugSentry() {
  const [boom, setBoom] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  const enabled =
    import.meta.env.PROD || import.meta.env.VITE_SENTRY_FORCE === '1'

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl text-ink">Debug Sentry</h1>
      <p className="mt-2 text-sm text-body">
        Página interna para verificar que los errores llegan a Sentry. No está
        indexada y no se enlaza desde ningún lado.
      </p>

      <div
        className={`mt-4 rounded-md border px-4 py-3 text-sm font-bold ${
          enabled
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        {enabled
          ? 'Sentry está ACTIVO en este entorno — los eventos se enviarán.'
          : 'Sentry está APAGADO en dev. Corre con VITE_SENTRY_FORCE=1 bun run dev (o pruébalo en producción) para que envíe.'}
      </div>

      <div className="mt-6 grid gap-3">
        <TestButton
          label="1. Error sin capturar (throw en onClick)"
          hint="Lo atrapa el handler global de Sentry."
          onClick={() => {
            throw new Error('Litrito test: uncaught onClick error')
          }}
        />
        <TestButton
          label="2. Rechazo de promesa sin manejar"
          hint="Lo atrapa unhandledrejection."
          onClick={() => {
            void Promise.reject(new Error('Litrito test: unhandled rejection'))
          }}
        />
        <TestButton
          label="3. captureException manual"
          hint="Reporte explícito con tag de prueba."
          onClick={() => {
            const id = Sentry.captureException(
              new Error('Litrito test: manual captureException'),
              { tags: { test: 'debug-sentry' } },
            )
            setSent(id)
          }}
        />
        <TestButton
          label="4. Romper un componente (boundary a nivel componente)"
          hint="El componente falla con su fallback local; el resto de la página sigue viva."
          onClick={() => setBoom(true)}
        />
      </div>

      {sent && (
        <p className="mt-4 text-xs font-bold text-body">
          Evento enviado a Sentry. ID: <code>{sent}</code>
        </p>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-bold text-ink">Zona del componente</h2>
        <p className="mb-2 text-xs text-body">
          El botón 4 hace que esto truene. Fíjate que el header y los botones de
          arriba siguen funcionando.
        </p>
        <ComponentErrorBoundary name="debug-sentry-bomb" context={{ boom }}>
          <Bomb boom={boom} />
        </ComponentErrorBoundary>
      </div>
    </main>
  )
}

function Bomb({ boom }: { boom: boolean }) {
  if (boom) {
    throw new Error('Litrito test: component render crash')
  }
  return (
    <div className="rounded-md border border-line bg-white px-4 py-3 text-sm text-body">
      Componente sano. Presiona el botón 4 para romperlo.
    </div>
  )
}

function TestButton({
  label,
  hint,
  onClick,
}: {
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-line bg-white px-4 py-3 text-left transition hover:border-ink/40"
    >
      <span className="block text-sm font-bold text-ink">{label}</span>
      <span className="block text-xs text-body">{hint}</span>
    </button>
  )
}
