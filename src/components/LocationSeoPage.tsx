import { useState } from 'react'
import type { ReactNode } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { ArrowRight, BarChart3, Fuel, Info, MapPin } from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { FUEL_META } from '#/lib/fuel'
import type { FuelType } from '#/lib/fuel'
import { AnimatedCount, AnimatedPrice } from './AnimatedNumber'
import { Button } from '#/components/ui/button'
import { SiteFooter } from './SiteFooter'

type FuelMetric = {
  fuelType: FuelType
  average: number | null
  min: number | null
  max: number | null
  count: number
}

type MetricsView = 'curated' | 'raw'

type TopRegularRow = {
  station: {
    permitNumber: string
    name: string
    address: string
    municipalityName?: string
    stateName?: string
  }
  price: number
  reportedAt?: string
}

type LocationOverview = {
  state: { externalId: string; name: string; slug: string }
  municipality: { externalId: string; name: string; slug: string } | null
  metrics: FuelMetric[]
  stationCount: number
  topRegular: TopRegularRow[]
  views?: Record<
    MetricsView,
    {
      metrics: FuelMetric[]
      topRegular: TopRegularRow[]
    }
  >
  priceBand?: { min: number; max: number }
  excludedPriceRows?: number
  states: { externalId: string; name: string; slug: string; count: number }[]
  municipalities: {
    externalId: string
    stateExternalId: string
    name: string
    slug: string
    count: number
  }[]
}


function formatCurrency(value: number | null): string {
  if (value == null) return 'Sin datos'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-MX').format(value)
}

export function LocationSeoPage({ data }: { data: LocationOverview }) {
  const [view, setView] = useState<MetricsView>('curated')
  const activeData = data.views?.[view] ?? {
    metrics: data.metrics,
    topRegular: data.topRegular,
  }
  const placeName = data.municipality
    ? `${data.municipality.name}, ${data.state.name}`
    : data.state.name
  const regularMetric = activeData.metrics.find((m) => m.fuelType === 'regular')
  const exploreSearch = data.municipality
    ? `?state=${data.state.externalId}&municipality=${data.state.externalId}:${data.municipality.externalId}&fuels=regular&primary=regular&sort=price`
    : `?state=${data.state.externalId}&fuels=regular&primary=regular&sort=price`

  return (
    <main className="min-h-screen bg-white">
      <section className="bg-ink text-on-dark">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.65fr)] lg:px-8">
          <div>
            <div className="eyebrow inline-flex items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
              <MapPin className="h-4 w-4" />
              Precios por ubicación
            </div>
            <h1 className="font-display mt-5 text-4xl leading-none text-white sm:text-6xl">
              Gasolina en {placeName}
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-light leading-8 text-white/70">
              Consulta promedios, rangos y estaciones con mejor precio reportado
              para tomar una decisión antes de cargar combustible.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button render={<a href={`/explorar${exploreSearch}`} />}>
                Ver estaciones
                <ArrowRight className="h-4 w-4" />
              </Button>
              {data.municipality && (
                <Button
                  render={<a href={`/estado/${data.state.slug}`} />}
                  variant="outline-white"
                >
                  Todo {data.state.name}
                </Button>
              )}
            </div>
            <div className="mt-6 flex items-center gap-2">
              <div className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1">
                <ViewButton
                  active={view === 'curated'}
                  onClick={() => setView('curated')}
                >
                  Curada
                </ViewButton>
                <ViewButton
                  active={view === 'raw'}
                  onClick={() => setView('raw')}
                >
                  Sin filtrar
                </ViewButton>
              </div>
              {data.priceBand && (
                <InfoTooltip
                  text={`La vista curada excluye ${formatNumber(
                    data.excludedPriceRows ?? 0,
                  )} precios fuera de ${formatCurrency(
                    data.priceBand.min,
                  )}–${formatCurrency(
                    data.priceBand.max,
                  )} por litro en esta ubicación. "Sin filtrar" muestra los datos tal cual llegan.`}
                />
              )}
            </div>
          </div>

          <div className="rounded-[6px] border border-white/15 bg-white/[0.04] p-5">
            <div className="eyebrow text-white/70">Promedio regular</div>
            <div className="mt-3 text-5xl font-black text-white">
              <AnimatedPrice value={regularMetric?.average ?? null} fallback="Sin datos" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <MetricPill label="Estaciones" value={<AnimatedCount value={data.stationCount} />} />
              <MetricPill
                label="Reportes"
                value={<AnimatedCount value={regularMetric?.count ?? 0} />}
              />
              <MetricPill label="Mínimo" value={<AnimatedPrice value={regularMetric?.min ?? null} fallback="Sin datos" />} />
              <MetricPill label="Máximo" value={<AnimatedPrice value={regularMetric?.max ?? null} fallback="Sin datos" />} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-brand" />
          <h2 className="font-display text-2xl text-ink">Métricas por combustible</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {activeData.metrics.map((metric) => (
            <article
              key={metric.fuelType}
              className="rounded-[6px] border border-line bg-white p-4"
              style={{ borderTopColor: FUEL_META[metric.fuelType].color, borderTopWidth: 3 }}
            >
              <div className="flex items-center gap-2 text-sm font-black text-ink">
                <Fuel className="h-4 w-4" style={{ color: FUEL_META[metric.fuelType].color }} />
                {FUEL_META[metric.fuelType].label}
              </div>
              <div className="mt-3 text-2xl font-black text-ink">
                <AnimatedPrice value={metric.average} />
              </div>
              <div className="mt-3 space-y-1 text-xs font-bold text-body">
                <div>Mínimo: <AnimatedPrice value={metric.min} /></div>
                <div>Máximo: <AnimatedPrice value={metric.max} /></div>
                <div>Reportes: <AnimatedCount value={metric.count} /></div>
              </div>
            </article>
          ))}
        </div>
        <FuelChart metrics={activeData.metrics} />
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-ink">
              Regular más barata en {placeName}
            </h2>
            <p className="mt-1 text-sm font-semibold text-body">
              Ranking basado en precios vigentes reportados por estación.
            </p>
          </div>
          <a
            href={`/explorar${exploreSearch}`}
            className="hidden rounded-full border border-line px-4 py-2 text-xs font-bold text-ink transition hover:border-ink sm:inline-flex"
          >
            Explorar más
          </a>
        </div>
        {activeData.topRegular.length === 0 ? (
          <div className="rounded-[6px] border border-line p-5 text-sm font-semibold text-body">
            No hay precios de regular vigentes para esta ubicación.
          </div>
        ) : (
          <>
            <StationsChart stations={activeData.topRegular} />
            <div className="mt-3 grid gap-2">
              {activeData.topRegular.map((row, index) => (
                <a
                  key={row.station.permitNumber}
                  href={`/estacion/${encodeURIComponent(row.station.permitNumber)}`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[6px] border border-line p-3 transition hover:border-ink"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-black text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-ink">
                      {row.station.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-body">
                      {[row.station.municipalityName, row.station.stateName]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  </div>
                  <div className="text-right text-base font-black text-ink">
                    <AnimatedPrice value={row.price} />
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <nav aria-label="Municipios del estado">
          <h2 className="font-display text-2xl text-ink">Municipios de {data.state.name}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.municipalities.map((municipality) => (
              <a
                key={municipality.externalId}
                href={`/estado/${data.state.slug}/${municipality.slug}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  data.municipality?.externalId === municipality.externalId
                    ? 'border-ink bg-ink text-white'
                    : 'border-line text-ink hover:border-ink'
                }`}
              >
                {municipality.name} · <AnimatedCount value={municipality.count} />
              </a>
            ))}
          </div>
        </nav>

        <nav aria-label="Estados de México">
          <h2 className="font-display text-2xl text-ink">Otros estados</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.states.map((state) => (
              <a
                key={state.externalId}
                href={`/estado/${state.slug}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  state.externalId === data.state.externalId && !data.municipality
                    ? 'border-brand bg-brand text-white'
                    : 'border-line text-ink hover:border-ink'
                }`}
              >
                {state.name}
              </a>
            ))}
          </div>
        </nav>
      </section>

      <SiteFooter />
    </main>
  )
}

type FuelChartEntry = {
  label: string
  fuelType: FuelType
  avg: number | null
  min: number | null
  max: number | null
  count: number
}

function FuelTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as FuelChartEntry
  return (
    <div className="rounded-[6px] border border-line bg-white p-3 text-xs shadow-md">
      <div className="mb-1.5 font-black" style={{ color: FUEL_META[d.fuelType].color }}>
        {d.label}
      </div>
      <div className="space-y-0.5 text-body">
        <div>
          Promedio: <span className="font-bold text-ink"><AnimatedPrice value={d.avg} /></span>
        </div>
        {d.min != null && (
          <div>
            Mínimo: <span className="font-bold text-ink"><AnimatedPrice value={d.min} /></span>
          </div>
        )}
        {d.max != null && (
          <div>
            Máximo: <span className="font-bold text-ink"><AnimatedPrice value={d.max} /></span>
          </div>
        )}
        <div>
          Reportes: <span className="font-bold text-ink"><AnimatedCount value={d.count} /></span>
        </div>
      </div>
    </div>
  )
}

function FuelChart({ metrics }: { metrics: FuelMetric[] }) {
  const chartData: FuelChartEntry[] = metrics
    .filter((m) => m.average != null)
    .map((m) => ({
      label: FUEL_META[m.fuelType].label,
      fuelType: m.fuelType,
      avg: m.average,
      min: m.min,
      max: m.max,
      count: m.count,
    }))

  if (chartData.length === 0) return null

  return (
    <div className="mt-4 rounded-[6px] border border-line p-4">
      <div className="eyebrow mb-3 text-body">Comparativa de precios promedio</div>
      <ClientOnly fallback={<div className="h-[180px]" />}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: '#25282b', fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={['dataMin - 1', 'dataMax + 1']}
              tick={{ fontSize: 10, fill: '#8c8c8c' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                  minimumFractionDigits: 0,
                }).format(v)
              }
              width={44}
            />
            <Tooltip cursor={{ fill: '#f5f5f5' }} content={FuelTooltip} />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={FUEL_META[entry.fuelType].color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ClientOnly>
    </div>
  )
}

type StationChartEntry = {
  name: string
  fullName: string
  price: number
  address: string
}

function StationTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as StationChartEntry
  return (
    <div className="rounded-[6px] border border-line bg-white p-3 text-xs shadow-md">
      <div className="mb-1 font-black text-ink">{d.fullName}</div>
      <div className="text-body">
        Precio: <span className="font-bold text-ink"><AnimatedPrice value={d.price} /></span>
      </div>
      {d.address && <div className="mt-0.5 text-body">{d.address}</div>}
    </div>
  )
}

function StationsChart({ stations }: { stations: TopRegularRow[] }) {
  const chartData: StationChartEntry[] = stations.map((s) => ({
    name: s.station.name.length > 24 ? `${s.station.name.slice(0, 24)}…` : s.station.name,
    fullName: s.station.name,
    price: s.price,
    address: s.station.address,
  }))

  return (
    <div className="rounded-[6px] border border-line p-4">
      <ClientOnly fallback={<div style={{ height: Math.max(160, stations.length * 42) }} />}>
        <ResponsiveContainer width="100%" height={Math.max(160, stations.length * 42)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 72, bottom: 4, left: 8 }}
          >
            <XAxis type="number" domain={['dataMin - 0.3', 'dataMax + 0.3']} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={180}
              tick={{ fontSize: 11, fill: '#25282b' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip cursor={{ fill: '#f5f5f5' }} content={StationTooltip} />
            <Bar dataKey="price" fill="#e60000" radius={[0, 4, 4, 0]}>
              <LabelList
                dataKey="price"
                position="right"
                formatter={(v) => formatCurrency(v as number)}
                style={{ fontSize: 11, fill: '#25282b', fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ClientOnly>
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
      className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
        active
          ? 'bg-white text-ink'
          : 'text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/60"
      title={text}
      aria-label={text}
    >
      <Info className="h-4 w-4" />
    </span>
  )
}

function MetricPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[6px] border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-white/65">
        {label}
      </div>
      <div className="mt-1 font-black text-white">{value}</div>
    </div>
  )
}
