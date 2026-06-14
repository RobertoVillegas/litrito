import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router'
import { Popover } from '@base-ui/react/popover'
import { useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  Fuel,
  Info,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
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
import { AnimatedCount, AnimatedPrice } from '../components/AnimatedNumber'
import { ChartSkeleton, Skeleton, SkeletonLine } from '../components/Skeleton'
import { track } from '#/lib/analytics'
import { getConfiguredSiteOrigin } from '../lib/site-url'
import { formatCurrency, formatAxisMXN, formatSignedMXN } from '#/lib/format'
import { COLORS } from '#/lib/colors'

export const Route = createFileRoute('/metricas')({
  head: () => {
    const title = 'Métricas de precios de gasolina en México - Litrito'
    const description =
      'Promedios, rangos y tendencias de precios de gasolina regular, premium, diésel y duba por estado en México.'
    const origin = getConfiguredSiteOrigin()
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
      ...(origin ? { links: [{ rel: 'canonical', href: `${origin}/metricas` }] } : {}),
    }
  },
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
  avgByStateByFuel?: Record<
    string,
    { stateExternalId: string; name: string; avg: number; count: number }[]
  >
  mostExpensiveState: { name: string; avg: number } | null
  cheapestState: { name: string; avg: number } | null
  mostExpensiveStateByFuel?: Record<string, { name: string; avg: number } | null>
  cheapestStateByFuel?: Record<string, { name: string; avg: number } | null>
  nationalAvgRegular: number | null
  nationalAvgByFuel?: Record<string, number | null>
}

type MetricsBundle = {
  curated: MetricsData
  raw: MetricsData
  priceBand: { min: number; max: number }
  excludedPriceRows: number
  generatedAt: string | null
}

type MetricsView = 'curated' | 'raw'

function Metrics() {
  const bundle = useQuery(api.metrics.getMetrics, {}) as MetricsBundle | undefined
  const [view, setView] = useState<MetricsView>('curated')
  const [stateFuel, setStateFuel] = useState<FuelType>('regular')
  const data = useMemo(() => (bundle ? bundle[view] : undefined), [bundle, view])

  const changeView = (next: MetricsView) => {
    setView(next)
    track('metrics_view', { view: next })
  }

  const changeStateFuel = (next: FuelType) => {
    setStateFuel(next)
    track('metrics_state_fuel', { fuel: next, view })
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

          {data && (
            <div className="mt-6 flex flex-col gap-2 text-xs text-white/55 sm:flex-row sm:items-center sm:gap-3">
              <span>
                <AnimatedCount value={data.pricedStations} /> estaciones con precio actualizado
                {data.totalStations !== data.pricedStations && (
                  <>
                    {' '}
                    de <AnimatedCount value={data.totalStations} /> registradas
                  </>
                )}
              </span>
              <span className="hidden sm:inline">·</span>
              <ViewToggle bundle={bundle} view={view} onChange={changeView} />
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
                      className="rounded-[6px] border border-line p-5 transition-colors duration-300"
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
                          prom. <AnimatedPrice value={m.avg} />
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

            {/* Per-fuel price spread */}
            <FuelSpreadChart data={data} />

            {/* Fuel selector + national/state snapshot */}
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="eyebrow text-body">Promedio nacional y estados extremos</h2>
                  <p className="mt-1 text-sm text-body">
                    Selecciona un combustible.
                  </p>
                </div>
                <FuelPicker value={stateFuel} onChange={changeStateFuel} />
              </div>

              <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-3">
                <SnapshotCard
                  label={`Promedio nacional ${FUEL_META[stateFuel].label}`}
                  value={
                    <AnimatedPrice
                      value={getNationalAvg(data, stateFuel)}
                      className="tabular-nums"
                    />
                  }
                  tone="neutral"
                  highlight
                  accent={FUEL_META[stateFuel].color}
                />
                <SnapshotCard
                  label="Estado más caro"
                  value={getMostExpensiveState(data, stateFuel)?.name ?? '—'}
                  subvalue={
                    <AnimatedPrice
                      value={getMostExpensiveState(data, stateFuel)?.avg}
                      className="tabular-nums"
                    />
                  }
                  tone="exp"
                  accent={COLORS.brand}
                />
                <SnapshotCard
                  label="Estado más barato"
                  value={getCheapestState(data, stateFuel)?.name ?? '—'}
                  subvalue={
                    <AnimatedPrice
                      value={getCheapestState(data, stateFuel)?.avg}
                      className="tabular-nums"
                    />
                  }
                  tone="cheap"
                  accent={COLORS.cheap}
                />
              </div>
            </div>

            {/* Avg by state, as delta vs national */}
            <StateDeltaChart data={data} fuel={stateFuel} />
          </div>
        )}
      </section>
    </main>
  )
}

function getStateRows(data: MetricsData, fuel: FuelType): MetricsData['avgByState'] {
  return data.avgByStateByFuel?.[fuel] ?? (fuel === 'regular' ? data.avgByState : [])
}

function getNationalAvg(data: MetricsData, fuel: FuelType): number | null {
  return data.nationalAvgByFuel?.[fuel] ?? (fuel === 'regular' ? data.nationalAvgRegular : null)
}

function getMostExpensiveState(
  data: MetricsData,
  fuel: FuelType,
): { name: string; avg: number } | null {
  return data.mostExpensiveStateByFuel?.[fuel] ?? (fuel === 'regular' ? data.mostExpensiveState : null)
}

function getCheapestState(
  data: MetricsData,
  fuel: FuelType,
): { name: string; avg: number } | null {
  return data.cheapestStateByFuel?.[fuel] ?? (fuel === 'regular' ? data.cheapestState : null)
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
    <div className="min-w-[200px] rounded-[6px] border border-line bg-white p-3 text-xs">
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
          <span className="font-bold text-ink"><AnimatedPrice value={min} /></span>
        </div>
        <div className="flex items-center justify-between gap-6 text-body">
          <span>Promedio</span>
          <span className="font-bold text-ink"><AnimatedPrice value={d.avg} /></span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-brand">Más cara</span>
          <span className="font-bold text-ink"><AnimatedPrice value={max} /></span>
        </div>
      </div>
      <div className="mt-2 border-t border-line pt-1.5 text-[11px] text-mute">
        Rango <AnimatedPrice value={max - min} /> · <AnimatedCount value={d.count} /> precios
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
        <ClientOnly fallback={<ChartSkeleton height={220} />}>
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
                tick={{ fontSize: 10, fill: COLORS.body }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tick={{ fontSize: 12, fontWeight: 700, fill: COLORS.ink }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip cursor={{ fill: COLORS.canvasSoft }} content={SpreadTooltip} />
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
  fuel: FuelType
  avg: number
  count: number
  delta: number
}

function StateDeltaTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as StateDeltaRow
  const pricier = d.delta >= 0
  const fuelLabel = FUEL_META[d.fuel].label
  return (
    <div className="min-w-[180px] rounded-[6px] border border-line bg-white p-3 text-xs">
      <div className="mb-1.5 font-black text-ink">{d.name}</div>
      <div className="flex items-center justify-between gap-6 text-body">
        <span>Promedio {fuelLabel}</span>
        <span className="font-bold text-ink"><AnimatedPrice value={d.avg} /></span>
      </div>
      <div
        className={`mt-0.5 flex items-center justify-between gap-6 font-bold ${
          pricier ? 'text-brand' : 'text-emerald-600'
        }`}
      >
        <span>vs. nacional</span>
        <span><AnimatedPrice value={d.delta} className="tabular-nums" /></span>
      </div>
      <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] text-mute">
        <AnimatedCount value={d.count} /> estaciones
      </div>
    </div>
  )
}

function StateDeltaChart({
  data,
  fuel,
}: {
  data: MetricsData
  fuel: FuelType
}) {
  const national = getNationalAvg(data, fuel)
  const stateRows = getStateRows(data, fuel)
  if (national == null || stateRows.length === 0) return null

  // State rows arrive sorted desc by avg (pricier first), which keeps the
  // diverging bars ordered from most expensive at the top to cheapest below.
  const rows: StateDeltaRow[] = stateRows.map((s) => ({
    stateExternalId: s.stateExternalId,
    name: s.name,
    fuel,
    avg: s.avg,
    count: s.count,
    delta: s.avg - national,
  }))

  return (
    <div>
      <div>
        <h2 className="eyebrow text-body">
          {FUEL_META[fuel].label} contra el promedio nacional
        </h2>
        <div className="mt-1 space-y-1 text-sm text-body">
          <p>
            Cada barra muestra la diferencia entre el precio promedio del estado y el nacional (<AnimatedPrice value={national} />).
          </p>
          <p>
            Verde indica estados más baratos que el promedio; rojo, estados más caros.
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-[6px] border border-line p-4">
        <ClientOnly fallback={<ChartSkeleton height={360} />}>
          <ResponsiveContainer width="100%" height={Math.max(360, rows.length * 26)}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            >
              <XAxis
                type="number"
                tickFormatter={formatSignedMXN}
                tick={{ fontSize: 10, fill: COLORS.body }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11, fill: COLORS.ink }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine x={0} stroke={COLORS.ink} strokeWidth={1.5} />
              <Tooltip cursor={{ fill: COLORS.canvasSoft }} content={StateDeltaTooltip} />
              <Bar dataKey="delta" radius={2}>
                {rows.map((r) => (
                  <Cell
                    key={r.stateExternalId}
                    fill={r.delta >= 0 ? COLORS.brand : COLORS.cheap}
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

function FuelPicker({
  value,
  onChange,
}: {
  value: FuelType
  onChange: (fuel: FuelType) => void
}) {
  return (
    <div className="w-full sm:w-auto">
      {/* Mobile: 2x2 pill grid */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        {FUELS.map((fuel) => {
          const active = value === fuel
          return (
            <button
              key={fuel}
              type="button"
              onClick={() => onChange(fuel)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black transition-colors duration-300 ${
                active
                  ? 'border-transparent text-white'
                  : 'border-line bg-white text-body hover:text-ink'
              }`}
              style={active ? { backgroundColor: FUEL_META[fuel].color } : undefined}
            >
              <Fuel className="h-3.5 w-3.5" />
              {FUEL_META[fuel].label}
            </button>
          )
        })}
      </div>

      {/* Desktop: segmented control */}
      <div className="hidden md:inline-flex rounded-full border border-line bg-white p-1">
        {FUELS.map((fuel) => {
          const active = value === fuel
          return (
            <button
              key={fuel}
              type="button"
              onClick={() => onChange(fuel)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black transition-colors duration-300 ${
                active ? 'text-white' : 'text-body hover:text-ink'
              }`}
              style={active ? { backgroundColor: FUEL_META[fuel].color } : undefined}
            >
              <Fuel className="h-3.5 w-3.5" />
              {FUEL_META[fuel].label}
            </button>
          )
        })}
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
              style={{ borderTopColor: COLORS.line, borderTopWidth: 3 }}
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
      <div>
        <SkeletonLine lead="h-[1.125rem]" bar="h-3" width="w-48" />
        <div className="mt-4 rounded-[6px] border border-line p-4">
          <Skeleton className="h-[220px] w-full" />
        </div>
      </div>
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SkeletonLine lead="h-[1.125rem]" bar="h-3" width="w-56" />
          <SkeletonLine lead="h-11" bar="h-11" width="w-full sm:w-64" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-[6px] border border-line bg-white p-4">
              <SkeletonLine lead="h-[15px]" bar="h-3" width="w-24" />
              <SkeletonLine lead="h-7" bar="h-6" width="w-32" className="mt-2" />
              <SkeletonLine lead="h-5" bar="h-3.5" width="w-20" className="mt-1" />
            </div>
          ))}
        </div>
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

function ViewToggle({
  bundle,
  view,
  onChange,
}: {
  bundle: MetricsBundle | undefined
  view: MetricsView
  onChange: (next: MetricsView) => void
}) {
  const text =
    bundle && view === 'curated'
      ? `La vista curada excluye ${bundle.excludedPriceRows.toLocaleString(
          'es-MX',
        )} precios fuera de ${formatCurrency(bundle.priceBand.min)}–${formatCurrency(
          bundle.priceBand.max,
        )} por litro: montos que la fuente (CNE) reporta por error y que distorsionan los extremos y promedios. "Sin filtrar" muestra los datos tal cual llegan.`
      : 'Vista sin filtrar: incluye todos los precios reportados por la CNE, incluso los que parecen errores.'

  return (
    <span className="flex w-full flex-row flex-wrap items-center gap-2 sm:inline-flex sm:w-auto">
      <span className="flex flex-1 rounded-full border border-white/15 bg-black/10 p-1 sm:flex-none">
        <ViewButton active={view === 'curated'} onClick={() => onChange('curated')}>
          Curada
        </ViewButton>
        <ViewButton active={view === 'raw'} onClick={() => onChange('raw')}>
          Sin filtrar
        </ViewButton>
      </span>
      <InfoTooltip text={text} tone="dark" />
    </span>
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
      className={`flex-1 rounded-full px-2.5 py-1 text-xs font-bold transition sm:flex-none sm:px-3 ${
        active ? 'bg-white text-ink' : 'text-white/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

type InfoTooltipTone = 'dark' | 'light'

function InfoTooltip({ text, tone = 'light' }: { text: string; tone?: InfoTooltipTone }) {
  const isDark = tone === 'dark'
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Más información"
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition ${
          isDark
            ? 'border-white/15 text-white/60 hover:text-white data-popup-open:border-white/40 data-popup-open:text-white'
            : 'border-line text-body hover:text-ink data-popup-open:border-ink data-popup-open:text-ink'
        }`}
      >
        <Info className="h-3 w-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={8}
          className="z-[1400] max-w-[calc(100vw-2rem)]"
        >
          <Popover.Popup className="relative w-[min(18rem,calc(100vw-2rem))] origin-[var(--transform-origin)] rounded-lg border border-line bg-white p-3 text-left text-xs font-medium leading-5 text-ink outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
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
      <div className="font-display mt-1 text-2xl text-ink"><AnimatedPrice value={e.price} className="tabular-nums" /></div>
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

function SnapshotCard({
  label,
  value,
  subvalue,
  tone,
  highlight = false,
  accent,
}: {
  label: string
  value: ReactNode
  subvalue?: ReactNode
  tone: 'neutral' | 'cheap' | 'exp'
  highlight?: boolean
  accent?: string
}) {
  const toneClass =
    tone === 'cheap' ? 'text-emerald-600' : tone === 'exp' ? 'text-brand' : 'text-ink'
  return (
    <div
      className="flex h-full flex-col rounded-[6px] border border-line bg-white p-4 transition-colors duration-300"
      style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-body">
        {accent && (
          <span
            className="h-2 w-2 rounded-full transition-colors duration-300"
            style={{ background: accent }}
          />
        )}
        {label}
      </div>
      <div
        className={`mt-1 flex min-w-0 flex-1 items-center truncate font-black ${toneClass} ${
          highlight
            ? 'font-display text-[clamp(2rem,5vw,3rem)] leading-[1]'
            : 'text-xl'
        }`}
      >
        {value}
      </div>
      {subvalue && (
        <div className="mt-auto pt-1 text-sm font-semibold text-body">{subvalue}</div>
      )}
    </div>
  )
}
