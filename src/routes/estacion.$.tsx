import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Check, Info, MapPin, Navigation, Share2, Star } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { api } from '../../convex/_generated/api'
import { cn } from '#/lib/utils'
import { useFavorites } from '#/lib/useFavorites'
import { FUEL_META, FUEL_ORDER } from '#/lib/fuel'
import type { FuelType } from '#/lib/fuel'
import { RouteErrorFallback } from '../components/RouteError'
import { DarkSkeleton, Skeleton, SkeletonLine } from '../components/Skeleton'
import { track } from '#/lib/analytics'

const StationMiniMap = lazy(() =>
  import('../components/StationMiniMap').then((m) => ({ default: m.StationMiniMap })),
)

function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <>{fallback ?? null}</>
  return <>{children}</>
}

export const Route = createFileRoute('/estacion/$')({
  loader: async ({ context, params }) => {
    const permitNumber = params._splat ?? ''
    return await context.queryClient.ensureQueryData(
      context.convexQueryClient.queryOptions(api.stations.getStationDetail, {
        permitNumber,
      }),
    )
  },
  head: ({ loaderData, params }) => {
    const data = loaderData as StationDetailData | null | undefined
    const station = data?.station
    const currentPrices = data?.currentPrices ?? {}
    const sharePrice = pickSharePrice(currentPrices)
    const title = station
      ? `${station.name} - Litrito`
      : `Estación ${params._splat ?? ''} - Litrito`
    const description = station
      ? [
          sharePrice
            ? `${FUEL_META[sharePrice.fuelType].label} a ${formatCurrency(sharePrice.price)}`
            : 'Precios de gasolina',
          [station.municipalityName, station.stateName].filter(Boolean).join(', '),
        ]
          .filter(Boolean)
          .join(' en ')
      : 'Consulta precios de gasolina por estación en Litrito.'

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
    }
  },
  component: StationDetail,
  errorComponent: ({ error, reset }) => {
    const { _splat } = Route.useParams()
    return (
      <RouteErrorFallback
        error={error}
        reset={reset}
        screen="station-detail"
        context={{ route: '/estacion/$', permitNumber: _splat }}
      />
    )
  },
})


function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string | undefined, withTime = false): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

type HistoryEntry = {
  fuelType: FuelType
  price: number
  reportedAt?: string
  ingestedAt: string
}

type StationDetailData = {
  station: {
    permitNumber: string
    name: string
    address: string
    stateName?: string
    municipalityName?: string
    latitude?: number
    longitude?: number
    lastSeenAt: string
  }
  currentPrices: Record<string, { price: number; reportedAt?: string }>
  history: HistoryEntry[]
}

function StationDetail() {
  const { _splat } = Route.useParams()
  const permitNumber = _splat ?? ''
  const initialData = Route.useLoaderData() as StationDetailData | null | undefined
  const { isFavorite, toggleFavorite } = useFavorites()
  const [favMsg, setFavMsg] = useState('')
  const [shareMsg, setShareMsg] = useState('')
  const queriedData = useQuery(api.stations.getStationDetail, { permitNumber }) as
    | StationDetailData
    | null
    | undefined
  const data = queriedData === undefined ? initialData : queriedData

  if (data === undefined) {
    return (
      <main className="min-h-screen">
        <StationDetailSkeleton />
      </main>
    )
  }

  if (data === null) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <BackLink />
          <h1 className="font-display mt-6 text-4xl text-ink">No encontrada</h1>
          <p className="mt-3 text-body">
            No tenemos datos para el permiso{' '}
            <span className="font-semibold text-ink">{permitNumber}</span>.
          </p>
        </div>
      </main>
    )
  }

  const { station, currentPrices, history } = data
  const fuels = FUEL_ORDER.filter((f) => currentPrices[f])
  const hasCoords =
    typeof station.latitude === 'number' && typeof station.longitude === 'number'
  const directionsHref = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`
    : undefined
  const sharePrice = pickSharePrice(currentPrices)

  return (
    <main className="min-h-screen">
      {/* Hero band */}
      <section className="bg-ink text-on-dark">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <BackLink onDark />
            <span className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white/50">
              Permiso {station.permitNumber}
            </span>
          </div>
          <h1 className="font-display mt-6 text-4xl text-white sm:text-6xl">
            {station.name}
          </h1>
          <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-white/70">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
            <span>
              {station.address}
              {(station.municipalityName || station.stateName) && (
                <span className="block text-white/50">
                  {[station.municipalityName, station.stateName]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              )}
            </span>
          </p>
          <p className="mt-3 text-xs font-semibold tracking-wide text-white/40">
            Actualizado {formatDate(station.lastSeenAt, true)}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {directionsHref && (
              <a
                className="btn-pill btn-pill--primary"
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation className="h-4 w-4" />
                Cómo llegar
              </a>
            )}
            <button
              type="button"
              onClick={async () => {
                const result = await toggleFavorite(permitNumber)
                setFavMsg(result.message)
              }}
              className={
                isFavorite(permitNumber)
                  ? 'btn-pill btn-pill--primary'
                  : 'btn-pill border border-white/40 text-white hover:bg-white/10'
              }
            >
              <Star
                className="h-4 w-4"
                fill={isFavorite(permitNumber) ? 'currentColor' : 'none'}
              />
              {isFavorite(permitNumber) ? 'Favorita' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() =>
                void shareStation({
                  permitNumber,
                  stationName: station.name,
                  price: sharePrice,
                  onDone: setShareMsg,
                })
              }
              className="btn-pill border border-white/40 text-white hover:bg-white/10"
            >
              {shareMsg ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              Compartir
            </button>
          </div>
          {favMsg && (
            <p className="mt-2 text-xs font-semibold text-white/60">{favMsg}</p>
          )}
          {shareMsg && (
            <p className="mt-2 text-xs font-semibold text-white/60">{shareMsg}</p>
          )}
        </div>
      </section>

      {/* Map */}
      {hasCoords && (
        <section className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6 lg:px-8">
          <ClientOnly>
            <Suspense
              fallback={
                <div className="h-[320px] rounded-[6px] border border-line bg-canvas-soft" />
              }
            >
              <StationMiniMap
                latitude={station.latitude as number}
                longitude={station.longitude as number}
              />
            </Suspense>
          </ClientOnly>
        </section>
      )}

      {/* Current prices */}
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <h2 className="eyebrow text-body">Precios actuales</h2>
        {fuels.length === 0 ? (
          <p className="mt-3 text-sm text-body">
            Esta estación aún no tiene precios reportados.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {fuels.map((f) => (
              <div
                key={f}
                className="rounded-[6px] border border-line p-4"
                style={{ borderTopColor: FUEL_META[f].color, borderTopWidth: 3 }}
              >
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-body">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: FUEL_META[f].color }}
                  />
                  {FUEL_META[f].label}
                </div>
                <div className="font-display mt-2 text-3xl text-ink">
                  {formatCurrency(currentPrices[f].price)}
                </div>
                <div className="mt-1 text-[11px] text-mute">
                  {currentPrices[f].reportedAt
                    ? `Reportado ${formatDate(currentPrices[f].reportedAt)}`
                    : 'Por litro'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* History */}
        <div className="mt-12">
          <h2 className="eyebrow text-body">Histórico de precios</h2>
          <PriceHistoryChart history={history} />
          <PriceHistoryList history={history} />
        </div>
      </section>
    </main>
  )
}

function StationDetailSkeleton() {
  return (
    <>
      <section className="bg-ink text-on-dark">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <DarkSkeleton className="h-4 w-32" />
            <DarkSkeleton className="h-6 w-32 rounded-full" />
          </div>
          <DarkSkeleton className="mt-6 h-9 w-4/5 sm:h-14" />
          <div className="mt-4 flex items-start gap-2">
            <DarkSkeleton className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <SkeletonLine dark lead="h-6" bar="h-3.5" width="w-3/5" />
              <SkeletonLine dark lead="h-6" bar="h-3.5" width="w-2/5" />
            </div>
          </div>
          <SkeletonLine dark lead="h-4" bar="h-3" width="w-40" className="mt-3" />
          <div className="mt-6 flex flex-wrap gap-3">
            <DarkSkeleton className="h-10 w-32 rounded-full" />
            <DarkSkeleton className="h-10 w-28 rounded-full" />
            <DarkSkeleton className="h-10 w-32 rounded-full" />
          </div>
        </div>
      </section>
      <section className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6 lg:px-8">
        <Skeleton className="h-[320px] w-full" />
      </section>
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <SkeletonLine lead="h-[1.125rem]" bar="h-3" width="w-32" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="rounded-[6px] border border-line p-4"
              style={{ borderTopColor: '#e6e6e6', borderTopWidth: 3 }}
            >
              <SkeletonLine lead="h-4" bar="h-2.5" width="w-20" />
              <SkeletonLine lead="h-7" bar="h-6" width="w-24" className="mt-2" />
              <SkeletonLine lead="h-4" bar="h-2.5" width="w-28" className="mt-1" />
            </div>
          ))}
        </div>
        <div className="mt-12">
          <SkeletonLine lead="h-[1.125rem]" bar="h-3" width="w-40" />
          <div className="mt-4 rounded-[6px] border border-line p-4">
            <Skeleton className="h-[240px] w-full" />
            <div className="mt-3 flex flex-wrap gap-3">
              {Array.from({ length: 3 }, (_, i) => (
                <SkeletonLine key={i} lead="h-4" bar="h-3" width="w-16" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function pickSharePrice(
  prices: Record<string, { price: number; reportedAt?: string }>,
) {
  const entries = Object.entries(prices)
    .filter((entry): entry is [FuelType, { price: number; reportedAt?: string }] =>
      ['regular', 'premium', 'diesel', 'duba'].includes(entry[0]),
    )
    .sort((a, b) => a[1].price - b[1].price)
  if (entries.length === 0) return null
  const [fuelType, value] = entries[0]
  return { fuelType, price: value.price }
}

async function shareStation({
  permitNumber,
  stationName,
  price,
  onDone,
}: {
  permitNumber: string
  stationName: string
  price: { fuelType: FuelType; price: number } | null
  onDone: (message: string) => void
}) {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/estacion/${encodeURIComponent(permitNumber)}`
      : ''
  const priceText = price
    ? `${FUEL_META[price.fuelType].label} a ${formatCurrency(price.price)}`
    : 'Precios de gasolina'
  const title = `${stationName} en Litrito`
  const text = `${priceText} en ${stationName}.`

  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, text, url })
      track('share_station', { method: 'native', permitNumber })
      onDone('Compartido.')
      return
    }
    await navigator.clipboard.writeText(`${text} ${url}`)
    track('share_station', { method: 'clipboard', permitNumber })
    onDone('Link copiado.')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    onDone('No se pudo compartir.')
  }
}

function BackLink({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-1.5 text-xs font-bold ${
        onDark ? 'text-white/60 hover:text-white' : 'text-body hover:text-ink'
      }`}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Volver al listado
    </Link>
  )
}

type ChartRow = { t: number } & Partial<Record<FuelType, number>>

function HistoryTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const date = new Date(label as number)
  return (
    <div className="min-w-[156px] rounded-[6px] border border-line bg-white p-3 text-xs shadow-md">
      <div className="mb-2 font-black text-ink">{formatDate(date.toISOString(), true)}</div>
      {payload.map((entry) => {
        const fuel = entry.dataKey as FuelType
        const meta = FUEL_META[fuel]
        if (!meta || entry.value == null) return null
        return (
          <div key={fuel} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-body">
              <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
              {meta.label}
            </span>
            <span className="font-bold text-ink">{formatCurrency(entry.value as number)}</span>
          </div>
        )
      })}
    </div>
  )
}

function PriceHistoryChart({ history }: { history: HistoryEntry[] }) {
  const snapshotMap = new Map<number, Partial<Record<FuelType, number>>>()
  for (const h of history) {
    const t = new Date(h.ingestedAt).getTime()
    if (Number.isNaN(t)) continue
    if (!snapshotMap.has(t)) snapshotMap.set(t, {})
    snapshotMap.get(t)![h.fuelType] = h.price
  }

  const chartData: ChartRow[] = [...snapshotMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, prices]) => ({ t, ...prices }))

  const activeFuels = FUEL_ORDER.filter((f) => chartData.some((row) => f in row))

  if (chartData.length === 0) {
    return (
      <p className="mt-3 text-sm text-body">
        Aún no hay suficiente historial. Se registrará cada vez que cambie un precio.
      </p>
    )
  }

  return (
    <div className="mt-4 rounded-[6px] border border-line p-4">
      <ClientOnly fallback={<div className="h-[240px]" />}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={(t: number) => formatDate(new Date(t).toISOString())}
              tick={{ fontSize: 10, fill: '#7e7e7e' }}
              tickLine={false}
              axisLine={false}
              minTickGap={60}
            />
            <YAxis
              domain={['dataMin - 0.5', 'dataMax + 0.5']}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                  minimumFractionDigits: 0,
                }).format(v)
              }
              tick={{ fontSize: 10, fill: '#7e7e7e' }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip content={HistoryTooltip} />
            {activeFuels.map((f) => (
              <Line
                key={f}
                type="stepAfter"
                dataKey={f}
                name={FUEL_META[f].label}
                stroke={FUEL_META[f].color}
                strokeWidth={2}
                dot={{ r: 3, fill: FUEL_META[f].color, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ClientOnly>
      <div className="mt-3 flex flex-wrap gap-3">
        {activeFuels.map((f) => (
          <div key={f} className="flex items-center gap-1.5 text-xs font-semibold text-body">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: FUEL_META[f].color }} />
            {FUEL_META[f].label}
          </div>
        ))}
      </div>
    </div>
  )
}

type Snapshot = {
  t: number
  ingestedAt: string
  fuels: Partial<Record<FuelType, number>>
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) return null
  const up = delta > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
        up ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600',
      )}
    >
      {up ? '↑' : '↓'}
      {formatCurrency(Math.abs(delta))}
    </span>
  )
}

function FuelDot({ fuel }: { fuel: FuelType }) {
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: FUEL_META[fuel].color }}
    />
  )
}

function PriceHistoryList({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null

  const snapshotMap = new Map<number, Snapshot>()
  for (const h of history) {
    const t = new Date(h.ingestedAt).getTime()
    if (Number.isNaN(t)) continue
    if (!snapshotMap.has(t)) snapshotMap.set(t, { t, ingestedAt: h.ingestedAt, fuels: {} })
    snapshotMap.get(t)!.fuels[h.fuelType] = h.price
  }

  const snapshots = [...snapshotMap.values()].sort((a, b) => b.t - a.t)
  const activeFuels = FUEL_ORDER.filter((f) => snapshots.some((s) => f in s.fuels))

  // Δ vs the previous snapshot that recorded a price for the same fuel.
  const getDelta = (rowIdx: number, fuel: FuelType): number | null => {
    const current = snapshots[rowIdx].fuels[fuel]
    if (current == null) return null
    for (let i = rowIdx + 1; i < snapshots.length; i++) {
      const prev = snapshots[i].fuels[fuel]
      if (prev != null) return current - prev
    }
    return null
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold text-mute">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Los precios no cambian todos los días; solo se registra la fecha en que hubo un cambio.
      </div>

      {/* Desktop: pivot table (fecha × combustible) */}
      <div className="hidden overflow-hidden rounded-[6px] border border-line sm:block">
        <div className="max-h-96 overflow-auto">
          <table className="min-w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-line bg-canvas-soft">
                <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-body">
                  Fecha
                </th>
                {activeFuels.map((f) => (
                  <th key={f} className="px-4 py-2.5 text-right">
                    <div
                      className="flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-wider"
                      style={{ color: FUEL_META[f].color }}
                    >
                      <FuelDot fuel={f} />
                      {FUEL_META[f].label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap, rowIdx) => (
                <tr key={snap.t} className="border-b border-line last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-body">
                    {formatDate(snap.ingestedAt, true)}
                  </td>
                  {activeFuels.map((f) => {
                    const price = snap.fuels[f]
                    const delta = getDelta(rowIdx, f)
                    return (
                      <td key={f} className="whitespace-nowrap px-4 py-2.5">
                        {price != null ? (
                          // Fixed-width delta slot keeps every price right-aligned
                          // at the same column position regardless of the badge.
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold tabular-nums text-ink">
                              {formatCurrency(price)}
                            </span>
                            <span className="flex w-16 justify-start">
                              <DeltaBadge delta={delta} />
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-mute">—</span>
                            <span className="w-16" />
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: one card per snapshot */}
      <div className="space-y-3 sm:hidden">
        {snapshots.map((snap, rowIdx) => (
          <div key={snap.t} className="rounded-[6px] border border-line p-4">
            <div className="text-xs font-black text-ink">
              {formatDate(snap.ingestedAt, true)}
            </div>
            <div className="mt-3 space-y-1.5">
              {activeFuels.map((f) => {
                const price = snap.fuels[f]
                if (price == null) return null
                const delta = getDelta(rowIdx, f)
                return (
                  <div
                    key={f}
                    className="flex items-center justify-between gap-2 rounded-[6px] border border-line bg-canvas-soft px-2.5 py-1.5"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-body">
                      <FuelDot fuel={f} />
                      {FUEL_META[f].label}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-bold tabular-nums text-ink">
                        {formatCurrency(price)}
                      </span>
                      <DeltaBadge delta={delta} />
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
