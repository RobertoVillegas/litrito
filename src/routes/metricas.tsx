import { createFileRoute, Link } from '@tanstack/react-router'
import { Popover } from '@base-ui/react/popover'
import { useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Info, TrendingDown, TrendingUp } from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../../convex/_generated/api'
import { RouteErrorFallback } from '../components/RouteError'
import { Skeleton } from '../components/Skeleton'
import { track } from '#/lib/analytics'

export const Route = createFileRoute('/metricas')({
  component: Metrics,
  errorComponent: ({ error, reset }) => (
    <RouteErrorFallback
      error={error}
      reset={reset}
      screen="metrics"
      context={{ route: '/metricas' }}
    />
  ),
})

const FUELS = ['regular', 'premium', 'diesel', 'duba'] as const
const FUEL_META: Record<string, { label: string; color: string }> = {
  regular: { label: 'Regular', color: '#10b981' },
  premium: { label: 'Premium', color: '#f59e0b' },
  diesel: { label: 'Diésel', color: '#475569' },
  duba: { label: 'Diésel bajo azufre', color: '#0284c7' },
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

type Extreme = {
  price: number
  name: string
  municipalityName?: string
  stateName?: string
  permitNumber: string
} | null

type MetricsData = {
  totalStations: number
  pricedStations: number
  perFuel: Record<string, { cheapest: Extreme; expensive: Extreme; avg: number; count: number }>
  avgByState: { stateExternalId: string; name: string; avg: number; count: number }[]
  mostExpensiveState: { name: string; avg: number } | null
  cheapestState: { name: string; avg: number } | null
  nationalAvgRegular: number | null
}

type MetricsBundle = {
  curated: MetricsData
  raw: MetricsData
  priceBand: { min: number; max: number }
  excludedPriceRows: number
  generatedAt: string | null
}

type MetricsView = 'curated' | 'raw'

function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <>{fallback ?? null}</>
  return <>{children}</>
}

function Metrics() {
  const bundle = useQuery(api.metrics.getMetrics, {}) as MetricsBundle | undefined
  const [view, setView] = useState<MetricsView>('curated')
  const data = bundle ? bundle[view] : undefined

  const changeView = (next: MetricsView) => {
    setView(next)
    track('metrics_view', { view: next })
  }

  return (
    <main className="min-h-screen">
      <section className="bg-ink text-on-dark">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white/60 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al listado
            </Link>
            <div className="eyebrow inline-flex items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
              Datos CNE
            </div>
          </div>
          <h1 className="font-display mt-4 text-6xl text-white sm:text-7xl">Métricas</h1>
          <p className="mt-4 max-w-2xl text-lg font-light leading-8 text-white/70">
            Precios extremos por combustible, promedios por estado y dónde está
            la gasolina más cara y más barata del país.
          </p>
          {bundle && (
            <div className="mt-6 flex items-center gap-2">
              <div className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1">
                <ViewButton
                  active={view === 'curated'}
                  onClick={() => changeView('curated')}
                >
                  Curada
                </ViewButton>
                <ViewButton
                  active={view === 'raw'}
                  onClick={() => changeView('raw')}
                >
                  Sin filtrar
                </ViewButton>
              </div>
              <InfoTooltip
                text={`La vista curada excluye ${bundle.excludedPriceRows.toLocaleString(
                  'es-MX',
                )} precios fuera de ${formatCurrency(
                  bundle.priceBand.min,
                )}–${formatCurrency(
                  bundle.priceBand.max,
                )} por litro: montos que la fuente (CNE) reporta por error y que distorsionan los extremos y promedios. "Sin filtrar" muestra los datos tal cual llegan.`}
              />
            </div>
          )}
          {data && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Stat label="Estaciones" value={data.totalStations.toLocaleString('es-MX')} />
              <Stat label="Con precio" value={data.pricedStations.toLocaleString('es-MX')} />
              <Stat
                label="Promedio Regular"
                value={data.nationalAvgRegular ? formatCurrency(data.nationalAvgRegular) : '—'}
              />
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {data === undefined ? (
          <MetricsSkeleton />
        ) : data.pricedStations === 0 ? (
          <p className="text-sm text-body">
            Aún no hay precios cargados. Las métricas aparecerán cuando se ingesten.
          </p>
        ) : (
          <div className="space-y-12">
            {/* Per-fuel extremes */}
            <div>
              <h2 className="eyebrow text-body">Por combustible</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {FUELS.filter((f) => data.perFuel[f]?.count > 0).map((f) => {
                  const m = data.perFuel[f]
                  return (
                    <div
                      key={f}
                      className="rounded-[6px] border border-line p-5"
                      style={{ borderTopColor: FUEL_META[f].color, borderTopWidth: 3 }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-ink">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: FUEL_META[f].color }}
                          />
                          {FUEL_META[f].label}
                        </div>
                        <span className="text-xs text-mute">
                          prom. {formatCurrency(m.avg)}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <ExtremeCell kind="cheap" e={m.cheapest} />
                        <ExtremeCell kind="exp" e={m.expensive} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Most / least expensive state */}
            <div className="grid gap-4 sm:grid-cols-2">
              <StateCard
                kind="exp"
                title="Estado más caro"
                state={data.mostExpensiveState}
              />
              <StateCard
                kind="cheap"
                title="Estado más barato"
                state={data.cheapestState}
              />
            </div>

            {/* Avg by state bar chart */}
            <div>
              <h2 className="eyebrow text-body">Promedio Regular por estado</h2>
              <div className="mt-4 rounded-[6px] border border-line p-4">
                <ClientOnly
                  fallback={<div className="h-[360px]" />}
                >
                  <ResponsiveContainer width="100%" height={Math.max(360, data.avgByState.length * 26)}>
                    <BarChart
                      data={data.avgByState}
                      layout="vertical"
                      margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                    >
                      <XAxis type="number" domain={['dataMin - 0.5', 'dataMax + 0.5']} hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tick={{ fontSize: 11, fill: '#25282b' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: '#f2f2f2' }}
                        formatter={(value) => [formatCurrency(Number(value)), 'Promedio']}
                      />
                      <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                        {data.avgByState.map((_, i) => (
                          <Cell key={i} fill="#e60000" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ClientOnly>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function MetricsSkeleton() {
  return (
    <div className="space-y-12" aria-label="Cargando métricas">
      <div>
        <Skeleton className="h-3 w-32" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-[6px] border border-line p-5">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="space-y-2 rounded-[6px] bg-canvas-soft p-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <div className="space-y-2 rounded-[6px] bg-canvas-soft p-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div>
        <Skeleton className="h-3 w-48" />
        <Skeleton className="mt-4 h-[360px]" />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-white/15 bg-white/[0.04] px-4 py-2.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-white/50">
        {label}
      </div>
      <div className="mt-0.5 text-base font-bold text-white">{value}</div>
    </div>
  )
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
        active ? 'bg-white text-ink' : 'text-white/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Por qué hay dos vistas"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/60 transition hover:text-white data-popup-open:border-white/40 data-popup-open:text-white"
      >
        <Info className="h-3.5 w-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={8}
          className="z-[1400] max-w-[calc(100vw-2rem)]"
        >
          <Popover.Popup className="relative w-[min(18rem,calc(100vw-2rem))] origin-[var(--transform-origin)] rounded-lg border border-line bg-white p-3 text-left text-xs font-medium leading-5 text-ink shadow-[0_12px_40px_rgba(37,40,43,0.16)] outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <Popover.Arrow className="relative block h-2 w-3 overflow-clip data-[side=bottom]:top-[-7px] data-[side=left]:right-[-10px] data-[side=left]:rotate-90 data-[side=right]:left-[-10px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-7px] data-[side=top]:rotate-180 before:absolute before:bottom-0 before:left-1/2 before:h-2 before:w-2 before:-translate-x-1/2 before:translate-y-1/2 before:rotate-45 before:border before:border-line before:bg-white before:content-['']" />
            <Popover.Description>{text}</Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ExtremeCell({ kind, e }: { kind: 'cheap' | 'exp'; e: Extreme }) {
  if (!e) return <div className="text-xs text-mute">Sin datos</div>
  const cheap = kind === 'cheap'
  return (
    <div>
      <div
        className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${
          cheap ? 'text-emerald-600' : 'text-brand'
        }`}
      >
        {cheap ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
        {cheap ? 'Más barata' : 'Más cara'}
      </div>
      <div className="font-display mt-1 text-2xl text-ink">{formatCurrency(e.price)}</div>
      <Link
        to="/estacion/$"
        params={{ _splat: e.permitNumber }}
        className="mt-1 block truncate text-xs font-semibold text-ink hover:text-brand"
        title={e.name}
      >
        {e.name}
      </Link>
      <div className="truncate text-[11px] text-body">
        {[e.municipalityName, e.stateName].filter(Boolean).join(', ')}
      </div>
    </div>
  )
}

function StateCard({
  kind,
  title,
  state,
}: {
  kind: 'cheap' | 'exp'
  title: string
  state: { name: string; avg: number } | null
}) {
  const cheap = kind === 'cheap'
  return (
    <div className="rounded-[6px] border border-line p-5">
      <div
        className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${
          cheap ? 'text-emerald-600' : 'text-brand'
        }`}
      >
        {cheap ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
        {title}
      </div>
      {state ? (
        <>
          <div className="font-display mt-2 text-3xl text-ink">{state.name}</div>
          <div className="mt-1 text-sm font-semibold text-body">
            Promedio Regular {formatCurrency(state.avg)}
          </div>
        </>
      ) : (
        <div className="mt-2 text-sm text-mute">Sin datos</div>
      )}
    </div>
  )
}
