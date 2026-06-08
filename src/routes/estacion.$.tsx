import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Check, MapPin, Navigation, Share2, Star } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { useFavorites } from '#/lib/useFavorites'
import { RouteErrorFallback } from '../components/RouteError'
import { track } from '#/lib/analytics'

const StationMiniMap = lazy(() =>
  import('../components/StationMiniMap').then((m) => ({ default: m.StationMiniMap })),
)

function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
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

type FuelType = 'regular' | 'premium' | 'diesel' | 'duba' | 'unknown'

const FUEL_META: Record<FuelType, { label: string; color: string }> = {
  regular: { label: 'Regular', color: '#10b981' },
  premium: { label: 'Premium', color: '#f59e0b' },
  diesel: { label: 'Diésel', color: '#475569' },
  duba: { label: 'Diésel bajo azufre', color: '#0284c7' },
  unknown: { label: 'Otro', color: '#bebebe' },
}

const FUEL_ORDER: FuelType[] = ['regular', 'premium', 'diesel', 'duba', 'unknown']

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
        <div className="mx-auto w-full max-w-5xl px-4 py-16 text-sm font-semibold text-body sm:px-6 lg:px-8">
          Cargando estación…
        </div>
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

function PriceHistoryChart({ history }: { history: HistoryEntry[] }) {
  // Group history into per-fuel series, ascending by time.
  const series = new Map<FuelType, { t: number; price: number }[]>()
  for (const h of history) {
    const t = new Date(h.ingestedAt).getTime()
    if (Number.isNaN(t)) continue
    const arr = series.get(h.fuelType) ?? []
    arr.push({ t, price: h.price })
    series.set(h.fuelType, arr)
  }
  for (const arr of series.values()) arr.sort((a, b) => a.t - b.t)

  const allPoints = [...series.values()].flat()
  if (allPoints.length === 0) {
    return (
      <p className="mt-3 text-sm text-body">
        Aún no hay suficiente historial. Se registrará cada vez que cambie un precio.
      </p>
    )
  }

  const W = 640
  const H = 240
  const padL = 48
  const padR = 16
  const padT = 16
  const padB = 28

  let minT = Math.min(...allPoints.map((p) => p.t))
  let maxT = Math.max(...allPoints.map((p) => p.t))
  let minP = Math.min(...allPoints.map((p) => p.price))
  let maxP = Math.max(...allPoints.map((p) => p.price))
  if (minT === maxT) {
    minT -= 1
    maxT += 1
  }
  const pPad = (maxP - minP) * 0.15 || 0.5
  minP -= pPad
  maxP += pPad

  const x = (t: number) => padL + ((t - minT) / (maxT - minT)) * (W - padL - padR)
  const y = (p: number) => padT + (1 - (p - minP) / (maxP - minP)) * (H - padT - padB)

  const yTicks = 4
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => minP + ((maxP - minP) * i) / yTicks)

  const orderedFuels = FUEL_ORDER.filter((f) => series.has(f))

  return (
    <div className="mt-4 rounded-[6px] border border-line p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Histórico de precios"
      >
        {/* Y grid + labels */}
        {ticks.map((tk, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(tk)}
              y2={y(tk)}
              stroke="#e6e6e6"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={y(tk) + 3}
              textAnchor="end"
              fontSize={10}
              fill="#7e7e7e"
            >
              {tk.toFixed(2)}
            </text>
          </g>
        ))}
        {/* X axis date labels */}
        <text x={padL} y={H - 8} textAnchor="start" fontSize={10} fill="#7e7e7e">
          {formatDate(new Date(minT).toISOString())}
        </text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize={10} fill="#7e7e7e">
          {formatDate(new Date(maxT).toISOString())}
        </text>
        {/* Series */}
        {orderedFuels.map((f) => {
          const pts = series.get(f)!
          const color = FUEL_META[f].color
          const d = pts
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.price).toFixed(1)}`)
            .join(' ')
          return (
            <g key={f}>
              {pts.length > 1 && (
                <path d={d} fill="none" stroke={color} strokeWidth={2} />
              )}
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={x(p.t)}
                  cy={y(p.price)}
                  r={3}
                  fill={color}
                />
              ))}
            </g>
          )
        })}
      </svg>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {orderedFuels.map((f) => (
          <div key={f} className="flex items-center gap-1.5 text-xs font-semibold text-body">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: FUEL_META[f].color }}
            />
            {FUEL_META[f].label}
          </div>
        ))}
      </div>
    </div>
  )
}

function PriceHistoryList({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null
  // Already desc by creation; show as a chronological change log.
  const rows = [...history].sort(
    (a, b) => new Date(b.ingestedAt).getTime() - new Date(a.ingestedAt).getTime(),
  )
  return (
    <div className="mt-8 overflow-hidden rounded-[6px] border border-line">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-line bg-canvas-soft px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-body">
        <span>Fecha</span>
        <span>Combustible</span>
        <span className="text-right">Precio</span>
      </div>
      <div className="max-h-96 overflow-auto">
        {rows.map((h, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
          >
            <span className="text-body">{formatDate(h.ingestedAt, true)}</span>
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: FUEL_META[h.fuelType].color }}
              />
              {FUEL_META[h.fuelType].label}
            </span>
            <span className="text-right font-bold text-ink">
              {formatCurrency(h.price)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
