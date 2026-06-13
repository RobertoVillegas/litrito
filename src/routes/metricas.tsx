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
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { api } from '../../convex/_generated/api'
import { FUEL_META } from '#/lib/fuel'
import type { FuelType } from '#/lib/fuel'
import { RouteErrorFallback } from '../components/RouteError'
import { Skeleton, SkeletonLine } from '../components/Skeleton'
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatAxisMXN(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatSignedMXN(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatCurrency(value)}`
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

            {/* Per-fuel price spread */}
            <FuelSpreadChart data={data} />

            {/* Avg Regular by state, as delta vs national */}
            <StateDeltaChart data={data} />
          </div>
        )}
      </section>
    </main>
  )
}

type SpreadRow = {
  fuel: FuelType
  label: string
  range: [number, number]
  avg: number
  cheapestName: string
  expensiveName: string
  count: number
}

function SpreadTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as SpreadRow
  const [min, max] = d.range
  return (
    <div className="min-w-[200px] rounded-[6px] border border-line bg-white p-3 text-xs shadow-md">
      <div
        className="mb-2 flex items-center gap-1.5 font-black"
        style={{ color: FUEL_META[d.fuel].color }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: FUEL_META[d.fuel].color }} />
        {d.label}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="text-emerald-600">Más barata</span>
          <span className="font-bold text-ink">{formatCurrency(min)}</span>
        </div>
        <div className="flex items-center justify-between gap-6 text-body">
          <span>Promedio</span>
          <span className="font-bold text-ink">{formatCurrency(d.avg)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-brand">Más cara</span>
          <span className="font-bold text-ink">{formatCurrency(max)}</span>
        </div>
      </div>
      <div className="mt-2 border-t border-line pt-1.5 text-[11px] text-mute">
        Rango {formatCurrency(max - min)} · {d.count.toLocaleString('es-MX')} precios
      </div>
    </div>
  )
}

function FuelSpreadChart({ data }: { data: MetricsData }) {
  const rows: SpreadRow[] = FUELS.filter((f) => {
    const m = data.perFuel[f]
    return m?.count > 0 && m.cheapest && m.expensive
  }).map((f) => {
    const m = data.perFuel[f]
    return {
      fuel: f,
      label: FUEL_META[f].label,
      range: [m.cheapest!.price, m.expensive!.price],
      avg: m.avg,
      cheapestName: m.cheapest!.name,
      expensiveName: m.expensive!.name,
      count: m.count,
    }
  })

  if (rows.length === 0) return null

  return (
    <div>
      <h2 className="eyebrow text-body">Rango de precios por combustible</h2>
      <p className="mt-1 text-sm text-body">
        De la estación más barata a la más cara del país; el punto marca el promedio.
      </p>
      <div className="mt-4 rounded-[6px] border border-line p-4">
        <ClientOnly fallback={<div className="h-[220px]" />}>
          <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 52)}>
            <ComposedChart
              data={rows}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            >
              <XAxis
                type="number"
                domain={['dataMin - 1', 'dataMax + 1']}
                tickFormatter={formatAxisMXN}
                tick={{ fontSize: 10, fill: '#7e7e7e' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tick={{ fontSize: 12, fontWeight: 700, fill: '#25282b' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip cursor={{ fill: '#f5f5f5' }} content={SpreadTooltip} />
              <Bar dataKey="range" barSize={12} radius={6}>
                {rows.map((r) => (
                  <Cell key={r.fuel} fill={FUEL_META[r.fuel].color} fillOpacity={0.28} />
                ))}
              </Bar>
              <Scatter dataKey="avg">
                {rows.map((r) => (
                  <Cell key={r.fuel} fill={FUEL_META[r.fuel].color} />
                ))}
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        </ClientOnly>
      </div>
    </div>
  )
}

type StateDeltaRow = {
  stateExternalId: string
  name: string
  avg: number
  count: number
  delta: number
}

function StateDeltaTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as StateDeltaRow
  const pricier = d.delta >= 0
  return (
    <div className="min-w-[180px] rounded-[6px] border border-line bg-white p-3 text-xs shadow-md">
      <div className="mb-1.5 font-black text-ink">{d.name}</div>
      <div className="flex items-center justify-between gap-6 text-body">
        <span>Promedio Regular</span>
        <span className="font-bold text-ink">{formatCurrency(d.avg)}</span>
      </div>
      <div
        className={`mt-0.5 flex items-center justify-between gap-6 font-bold ${
          pricier ? 'text-brand' : 'text-emerald-600'
        }`}
      >
        <span>vs. nacional</span>
        <span>{formatSignedMXN(d.delta)}</span>
      </div>
      <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] text-mute">
        {d.count.toLocaleString('es-MX')} estaciones
      </div>
    </div>
  )
}

function StateDeltaChart({ data }: { data: MetricsData }) {
  const national = data.nationalAvgRegular
  if (national == null || data.avgByState.length === 0) return null

  // avgByState arrives sorted desc by avg (pricier first), which keeps the
  // diverging bars ordered from most expensive at the top to cheapest below.
  const rows: StateDeltaRow[] = data.avgByState.map((s) => ({
    stateExternalId: s.stateExternalId,
    name: s.name,
    avg: s.avg,
    count: s.count,
    delta: s.avg - national,
  }))

  return (
    <div>
      <h2 className="eyebrow text-body">Regular vs. promedio nacional</h2>
      <p className="mt-1 text-sm text-body">
        Diferencia del promedio estatal contra el nacional ({formatCurrency(national)}).
        Verde = más barato, rojo = más caro.
      </p>
      <div className="mt-4 rounded-[6px] border border-line p-4">
        <ClientOnly fallback={<div className="h-[360px]" />}>
          <ResponsiveContainer width="100%" height={Math.max(360, rows.length * 26)}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            >
              <XAxis
                type="number"
                tickFormatter={formatSignedMXN}
                tick={{ fontSize: 10, fill: '#7e7e7e' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11, fill: '#25282b' }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine x={0} stroke="#25282b" strokeWidth={1.5} />
              <Tooltip cursor={{ fill: '#f5f5f5' }} content={StateDeltaTooltip} />
              <Bar dataKey="delta" radius={2}>
                {rows.map((r) => (
                  <Cell
                    key={r.stateExternalId}
                    fill={r.delta >= 0 ? '#e60000' : '#10b981'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ClientOnly>
      </div>
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <div className="space-y-12" aria-label="Cargando métricas">
      <div>
        <SkeletonLine lead="h-[1.125rem]" bar="h-3" width="w-32" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="rounded-[6px] border border-line p-5"
              style={{ borderTopColor: '#e6e6e6', borderTopWidth: 3 }}
            >
              <div className="flex items-center justify-between gap-4">
                <SkeletonLine lead="h-5" bar="h-3.5" width="w-28" />
                <SkeletonLine lead="h-4" bar="h-3" width="w-16" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {[0, 1].map((cell) => (
                  <div key={cell}>
                    <SkeletonLine lead="h-[15px]" bar="h-2.5" width="w-16" />
                    <SkeletonLine lead="h-[23px]" bar="h-5" width="w-20" className="mt-1" />
                    <SkeletonLine lead="h-4" bar="h-3" width="w-full" className="mt-1" />
                    <SkeletonLine lead="h-4" bar="h-2.5" width="w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="rounded-[6px] border border-line p-5">
            <SkeletonLine lead="h-[15px]" bar="h-3" width="w-28" />
            <SkeletonLine lead="h-7" bar="h-6" width="w-40" className="mt-2" />
            <SkeletonLine lead="h-5" bar="h-3.5" width="w-48" className="mt-1" />
          </div>
        ))}
      </div>
      <div>
        <SkeletonLine lead="h-[1.125rem]" bar="h-3" width="w-48" />
        <div className="mt-4 rounded-[6px] border border-line p-4">
          <Skeleton className="h-[360px] w-full" />
        </div>
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
