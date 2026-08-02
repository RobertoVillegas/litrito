import { ClientOnly, createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
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
import { publicQueryOptions } from '#/features/public-data/react/query-options'
import { cn } from '#/lib/utils'
import { useFavorites } from '#/lib/useFavorites'
import { getConfiguredSiteOrigin } from '../lib/site-url'
import { buildSeoMeta } from '../lib/seo'
import { Button } from '#/components/ui/button'
import { FUEL_META, FUEL_ORDER } from '#/lib/fuel'
import type { FuelType } from '#/lib/fuel'
import { RouteErrorFallback } from '../components/RouteError'
import {
  resolveStationBrand,
  resolveStationName,
} from '#/lib/stationDisplay'
import { AnimatedPrice } from '../components/AnimatedNumber'
import { ChartSkeleton, DarkSkeleton, Skeleton, SkeletonLine } from '../components/Skeleton'
import { track } from '#/lib/analytics'
import { formatCurrency } from '#/lib/format'

const StationMiniMap = lazy(() =>
  import('../components/StationMiniMap').then((m) => ({ default: m.StationMiniMap })),
)

export const Route = createFileRoute('/estacion/$')({
  loader: async ({ context, params }) => {
    const permitNumber = params._splat ?? ''
    const data = await context.queryClient.ensureQueryData(
      publicQueryOptions.stationDetail({
        permitNumber,
      }),
    )
    // A missing permit must return a real HTTP 404, not a 200 "No encontrada"
    // shell — otherwise Google treats delisted stations as soft-404s and keeps
    // them in the crawl queue.
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData, params }) => {
    const data = loaderData as StationDetailData | null | undefined
    const station = data?.station
    const currentPrices = data?.currentPrices ?? {}
    const location = station
      ? [station.municipalityName, station.stateName].filter(Boolean).join(', ')
      : ''
    const ogSubtitle = station
      ? [station.address, location].filter(Boolean).join('\n')
      : 'Precios de gasolina actualizados a diario.'
    const priceSummary = formatStationPriceSummary(currentPrices)
    // Include street address in title to disambiguate stations with the same
    // name (e.g. multiple "Pemex" stations). Only the first segment (street +
    // number) keeps it concise while still unique per station.
    const street = station?.address ? station.address.split(',')[0].trim() : ''
    const title = station
      ? street
        ? `${station.name}, ${street} - Litrito`
        : `${station.name} - Litrito`
      : `Estación ${params._splat ?? ''} - Litrito`
    // Description must be unique per station and ≥ 70 chars. The address
    // guarantees uniqueness; price summary + location make it descriptive.
    const locationText = location ? `en ${location}` : ''
    const description = station
      ? [priceSummary || 'Precios de gasolina actualizados diario',
         locationText,
         `(${station.permitNumber})`]
          .filter(Boolean).join(' ')
      : 'Consulta precios de gasolina por estación en Litrito.'

    const origin = getConfiguredSiteOrigin()
    const canonical = `${origin}/estacion/${encodeURIComponent(params._splat ?? '')}`
    const jsonLd = station
      ? {
          '@context': 'https://schema.org',
          '@type': 'GasStation',
          name: station.name,
          address: {
            '@type': 'PostalAddress',
            streetAddress: station.address,
            addressLocality: station.municipalityName,
            addressRegion: station.stateName,
            addressCountry: 'MX',
          },
          ...(typeof station.latitude === 'number' && typeof station.longitude === 'number'
            ? {
                geo: {
                  '@type': 'GeoCoordinates',
                  latitude: station.latitude,
                  longitude: station.longitude,
                },
              }
            : {}),
          ...(origin ? { url: canonical } : {}),
        }
      : null

    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: station ? station.name : `Estación ${params._splat ?? ''}`,
          subtitle: ogSubtitle,
          eyebrow: 'Litrito estación',
          badges: formatOgPriceBadges(currentPrices),
        },
        url: origin ? canonical : undefined,
      }),
      ...(origin ? { links: [{ rel: 'canonical', href: canonical }] } : {}),
      ...(jsonLd
        ? { scripts: [{ type: 'application/ld+json', children: JSON.stringify(jsonLd) }] }
        : {}),
    }
  },
  component: StationDetail,
  errorComponent: StationDetailError,
})

function StationDetailError({ error, reset }: { error: Error; reset: () => void }) {
  const { _splat } = Route.useParams()
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      screen="station-detail"
      context={{ route: '/estacion/$', permitNumber: _splat }}
    />
  )
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
  currentPrices: Record<
    string,
    { price: number; reportedAt?: string; isPlausible?: boolean }
  >
  history: HistoryEntry[]
  enrichment?: {
    brand: string | null
    displayName: string | null
    source: string
  } | null
}

function StationDetail() {
  const { _splat } = Route.useParams()
  const permitNumber = _splat ?? ''
  const initialData = Route.useLoaderData() as StationDetailData | null | undefined
  const { isFavorite, toggleFavorite, ready: favoritesReady } = useFavorites()
  const [favMsg, setFavMsg] = useState('')
  const [shareMsg, setShareMsg] = useState('')
  const { data: queriedData } = useQuery(
    publicQueryOptions.stationDetail({ permitNumber }),
  ) as { data: StationDetailData | null | undefined }
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

  const { station, currentPrices, history, enrichment } = data
  // Show the recognizable name (brand / Overture display name) as the title and
  // keep the CNE razón social as a secondary line. Never replace the CNE data.
  const displayTitle = resolveStationName(station.name, enrichment)
  const displayBrand = resolveStationBrand(enrichment)
  const showLegalName = displayTitle !== station.name
  const fuels = FUEL_ORDER.filter((f) => currentPrices[f])
  const hasCoords =
    typeof station.latitude === 'number' && typeof station.longitude === 'number'
  const directionsHref = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`
    : undefined

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
          {displayBrand && (
            <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-brand">
              {displayBrand}
            </span>
          )}
          <h1
            className={`font-display text-4xl text-white sm:text-6xl ${displayBrand ? 'mt-2' : 'mt-6'}`}
          >
            {displayTitle}
          </h1>
          {showLegalName && (
            <p className="mt-2 text-xs font-semibold text-white/65">
              Razón social (CNE): {station.name}
            </p>
          )}
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
          <p className="mt-3 text-xs font-semibold tracking-wide text-white/65">
            Actualizado {formatDate(station.lastSeenAt, true)}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
            {directionsHref && (
              <Button
                render={
                  <a href={directionsHref} target="_blank" rel="noopener noreferrer" />
                }
                fullWidth
                className="sm:w-auto"
              >
                <Navigation className="h-4 w-4" />
                Cómo llegar
              </Button>
            )}
            {favoritesReady ? (
              <button
                type="button"
                onClick={async () => {
                  const result = await toggleFavorite(permitNumber)
                  setFavMsg(result.message)
                }}
                className={`w-full sm:w-auto ${
                  isFavorite(permitNumber)
                    ? 'btn-pill btn-pill--primary'
                    : 'btn-pill border border-white/40 text-white hover:bg-white/10'
                }`}
              >
                <Star
                  className="h-4 w-4"
                  fill={isFavorite(permitNumber) ? 'currentColor' : 'none'}
                />
                {isFavorite(permitNumber) ? 'Favorita' : 'Guardar'}
              </button>
            ) : (
              // Placeholder with the same footprint until favorite state is known,
              // so the label never flashes from "Guardar" to "Favorita".
              <div
                aria-hidden
                className="btn-pill w-full animate-pulse border border-white/15 bg-white/5 text-transparent sm:w-auto"
              >
                <Star className="h-4 w-4 text-white/20" />
                Guardar
              </div>
            )}
            <Button
              variant="outline-white"
              fullWidth
              className="col-span-2 sm:col-auto sm:w-auto"
              onClick={() =>
                void shareStation({
                  permitNumber,
                  stationName: station.name,
                  prices: currentPrices,
                  onDone: setShareMsg,
                })
              }
            >
              {shareMsg ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              Compartir
            </Button>
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
                className={`rounded-[6px] border p-4 ${
                  currentPrices[f].isPlausible === false
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-line'
                }`}
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
                  <AnimatedPrice value={currentPrices[f].price} />
                </div>
                <div className="mt-1 text-[11px] text-mute">
                  {currentPrices[f].reportedAt
                    ? `Reportado ${formatDate(currentPrices[f].reportedAt)}`
                    : 'Por litro'}
                </div>
                {currentPrices[f].isPlausible === false && (
                  <div className="mt-2 text-[11px] font-bold text-amber-800">
                    Dato atípico reportado por CNE
                  </div>
                )}
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

function formatStationPriceSummary(
  prices: Record<string, { price: number; reportedAt?: string }>,
) {
  const parts = FUEL_ORDER.flatMap((fuelType) => {
    const value = prices[fuelType]
    if (!value) return []
    return `${FUEL_META[fuelType].label} ${formatCurrency(value.price)}`
  })
  if (parts.length === 0) return ''
  return `Precios: ${parts.join(', ')}.`
}

function formatOgPriceBadges(
  prices: Record<string, { price: number; reportedAt?: string }>,
) {
  return FUEL_ORDER.flatMap((fuelType) => {
    const value = prices[fuelType]
    if (!value) return []
    return `${FUEL_META[fuelType].label}|${formatCurrency(value.price)}`
  })
}

function endPunct(value: string) {
  const text = value.trim()
  return /[.!?…]$/.test(text) ? text : `${text}.`
}

async function shareStation({
  permitNumber,
  stationName,
  prices,
  onDone,
}: {
  permitNumber: string
  stationName: string
  prices: Record<string, { price: number; reportedAt?: string }>
  onDone: (message: string) => void
}) {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/estacion/${encodeURIComponent(permitNumber)}`
      : ''
  const priceLines = formatSharePriceLines(prices)
  const title = `${stationName} en Litrito`
  const text = [
    `Mira esta estación en Litrito: ${endPunct(stationName)}`,
    priceLines.length ? ['', ...priceLines].join('\n') : 'Consulta sus precios de gasolina.',
    '',
    'Compara antes de cargar.',
  ].join('\n')

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

function formatSharePriceLines(
  prices: Record<string, { price: number; reportedAt?: string }>,
) {
  return FUEL_ORDER.flatMap((fuelType) => {
    const value = prices[fuelType]
    if (!value) return []
    return `${FUEL_META[fuelType].label}: ${formatCurrency(value.price)}`
  })
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
            <span className="font-bold text-ink"><AnimatedPrice value={entry.value as number} /></span>
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
      <ClientOnly fallback={<ChartSkeleton height={240} />}>
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
      <AnimatedPrice value={Math.abs(delta)} />
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
                          // Fixed-width delta slot on the left keeps every price
                          // right-aligned at the same column position.
                          <div className="flex items-center justify-end gap-2">
                            <span className="flex w-16 justify-end">
                              <DeltaBadge delta={delta} />
                            </span>
                            <span className="font-bold tabular-nums text-ink">
                              <AnimatedPrice value={price} />
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="w-16" />
                            <span className="text-mute">—</span>
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
                      <DeltaBadge delta={delta} />
                      <span className="font-bold tabular-nums text-ink">
                        <AnimatedPrice value={price} />
                      </span>
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
