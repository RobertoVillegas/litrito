import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Fuel, LocateFixed, MapPin, Navigation } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { RouteErrorFallback } from '../components/RouteError'
import { SiteFooter } from '../components/SiteFooter'
import { useUserLocation } from '#/lib/useUserLocation'
import { track } from '#/lib/analytics'
import type { FuelType } from '../components/StationFilters'

const StationMap = lazy(() =>
  import('../components/StationMap').then((m) => ({ default: m.StationMap })),
)

const FUEL_OPTIONS: { value: FuelType; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'premium', label: 'Premium' },
  { value: 'diesel', label: 'Diésel' },
  { value: 'duba', label: 'DUBA' },
]

const RADIUS_OPTIONS = [5, 10, 15, 25, 50] as const

type NearbyBestRow = {
  station: {
    permitNumber: string
    name: string
    address: string
    municipalityName?: string
    stateName?: string
    latitude?: number
    longitude?: number
  }
  price: number
  distanceKm: number
  reportedAt?: string
}

export const Route = createFileRoute('/')({
  component: Home,
  errorComponent: ({ error, reset }) => (
    <RouteErrorFallback
      error={error}
      reset={reset}
      screen="home"
      context={{ route: '/' }}
    />
  ),
})

function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <>{fallback ?? null}</>
  return <>{children}</>
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

function Home() {
  const userLoc = useUserLocation()
  const [fuelType, setFuelType] = useState<FuelType>('regular')
  const [radiusKm, setRadiusKm] = useState<(typeof RADIUS_OPTIONS)[number]>(15)

  const rows = useQuery(
    api.stations.bestNearbyStations,
    userLoc.location
      ? {
          fuelType,
          userLocation: {
            latitude: userLoc.location.latitude,
            longitude: userLoc.location.longitude,
          },
          limit: 10,
          maxDistanceKm: radiusKm,
        }
      : 'skip',
  ) as NearbyBestRow[] | undefined

  const rankedRows = useMemo(
    () =>
      rows?.map((row, index) => ({
        station: row.station,
        prices: { [fuelType]: { price: row.price } },
        highlightedPrice: row.price,
        rank: index + 1,
      })) ?? [],
    [rows, fuelType],
  )

  const hasLocation = Boolean(userLoc.location)
  const locationLabel =
    userLoc.location?.city ??
    userLoc.location?.region ??
    (hasLocation ? 'tu ubicación' : '')

  return (
    <main className="min-h-screen bg-white">
      <section className="bg-ink text-on-dark">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(280px,0.78fr)_minmax(420px,1.22fr)] lg:px-8">
          <div className="flex flex-col justify-between gap-8">
            <div>
              <div className="eyebrow inline-flex items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
                <Fuel className="h-4 w-4" />
                Cargar gasolina hoy
              </div>
              <h1 className="font-display mt-5 text-6xl text-white sm:text-8xl">
                Litrito
              </h1>
              <p className="mt-5 max-w-xl text-lg font-light leading-8 text-white/70">
                Elige combustible, comparte tu ubicación y encuentra las mejores
                estaciones cerca de ti.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="eyebrow text-white/45">Combustible</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {FUEL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setFuelType(option.value)
                        track('home_fuel', { fuel: option.value })
                      }}
                      className={`w-full rounded-[6px] border px-4 py-3 text-sm font-bold transition ${
                        fuelType === option.value
                          ? 'border-white bg-white text-ink'
                          : 'border-white/20 bg-white/[0.04] text-white/65 hover:border-white/50 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="eyebrow text-white/45">Radio</div>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {RADIUS_OPTIONS.map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      onClick={() => {
                        setRadiusKm(radius)
                        track('home_radius', { radiusKm: radius })
                      }}
                      className={`w-full rounded-[6px] border px-2 py-2 text-xs font-bold transition ${
                        radiusKm === radius
                          ? 'border-brand bg-brand text-white'
                          : 'border-white/20 bg-white/[0.04] text-white/65 hover:border-white/50 hover:text-white'
                      }`}
                    >
                      {radius} km
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={() => {
                    track('home_location_request', { fuel: fuelType, radiusKm })
                    userLoc.requestPrecise()
                  }}
                  className="btn-pill btn-pill--primary w-full justify-center"
                >
                  <LocateFixed className="h-4 w-4" />
                  {userLoc.hasPreciseLocation ? 'Actualizar ubicación' : 'Usar mi ubicación'}
                </button>
                <Link
                  to="/explorar"
                  className="btn-pill w-full justify-center border border-white/35 text-white hover:bg-white/10"
                >
                  Explorar estaciones
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {hasLocation && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-white/55">
                  <MapPin className="h-3.5 w-3.5 text-brand" />
                  Buscando cerca de {locationLabel}
                </p>
              )}
              {userLoc.preciseError && (
                <p className="text-xs font-semibold text-white/55">
                  {userLoc.preciseError}
                </p>
              )}
            </div>
          </div>

          <ResultsPanel
            fuelType={fuelType}
            hasLocation={hasLocation}
            radiusKm={radiusKm}
            rows={rows}
          />
        </div>
      </section>

      {hasLocation && rows && rows.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-4 grid gap-3 sm:flex sm:items-end sm:justify-between sm:gap-4">
            <div>
              <h2 className="font-display text-2xl text-ink">Mapa de resultados</h2>
              <p className="mt-1 text-sm font-semibold text-body">
                Los números del mapa corresponden al ranking de la lista.
              </p>
            </div>
            <Link
              to="/explorar"
              search={{ primary: fuelType, fuels: fuelType, sort: 'distance' }}
              className="inline-flex w-full justify-center rounded-[6px] border border-line px-4 py-3 text-xs font-bold text-ink transition hover:border-ink sm:w-auto sm:rounded-full sm:py-2"
            >
              Ver más
            </Link>
          </div>
          <ClientOnly
            fallback={
              <div className="flex h-[55vh] min-h-[320px] items-center justify-center rounded-md border border-line bg-canvas-soft text-sm text-body">
                Cargando mapa…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="flex h-[55vh] min-h-[320px] items-center justify-center rounded-md border border-line bg-canvas-soft text-sm text-body">
                  Cargando mapa…
                </div>
              }
            >
              <StationMap
                rows={rankedRows}
                primaryFuel={fuelType}
                fuelTypes={[fuelType]}
                userLocation={userLoc.location}
                autoCenterOnUserLocation
                markerMode="rank"
                onLocateClick={userLoc.requestPrecise}
              />
            </Suspense>
          </ClientOnly>
        </section>
      )}

      <SiteFooter />
    </main>
  )
}

function ResultsPanel({
  fuelType,
  hasLocation,
  radiusKm,
  rows,
}: {
  fuelType: FuelType
  hasLocation: boolean
  radiusKm: number
  rows: NearbyBestRow[] | undefined
}) {
  return (
    <div className="self-start rounded-[6px] border border-white/15 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow text-white/45">Top 10</div>
          <h2 className="font-display mt-1 text-2xl text-white">
            Mejores cerca de ti
          </h2>
        </div>
        <div className="rounded-full border border-white/15 px-3 py-1 text-xs font-black text-white/70">
          {fuelLabel(fuelType)}
        </div>
      </div>

      {!hasLocation ? (
        <div className="mt-4 rounded-[6px] border border-dashed border-white/20 px-4 py-6 text-sm font-semibold leading-6 text-white/60">
          Comparte tu ubicación para ver estaciones dentro de {radiusKm} km.
        </div>
      ) : rows === undefined ? (
        <div className="mt-4 rounded-[6px] border border-white/10 px-4 py-6 text-sm font-semibold text-white/60">
          Buscando mejores precios…
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-[6px] border border-white/10 px-4 py-6 text-sm font-semibold leading-6 text-white/60">
          No encontré {fuelLabel(fuelType)} dentro de {radiusKm} km. Amplía el
          radio o explora todas las estaciones.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map((row, index) => (
            <StationRankCard
              key={row.station.permitNumber}
              fuelType={fuelType}
              index={index}
              row={row}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StationRankCard({
  fuelType,
  index,
  row,
}: {
  fuelType: FuelType
  index: number
  row: NearbyBestRow
}) {
  const lat = row.station.latitude
  const lon = row.station.longitude
  const directionsHref =
    typeof lat === 'number' && typeof lon === 'number'
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
      : undefined

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[6px] border border-white/10 bg-white/[0.04] p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-black text-ink">
        {index + 1}
      </div>
      <Link
        to="/estacion/$"
        params={{ _splat: row.station.permitNumber }}
        className="min-w-0 hover:text-white"
      >
        <span className="block truncate text-sm font-black text-white">
          {row.station.name}
        </span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-white/50">
          {[row.station.municipalityName, row.station.stateName].filter(Boolean).join(', ')}
          {' · '}
          {formatDistance(row.distanceKm)}
        </span>
      </Link>
      <div className="text-right">
        <div className="text-base font-black text-white">
          {formatCurrency(row.price)}
        </div>
        {directionsHref ? (
          <a
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-wider text-brand hover:text-white"
            onClick={() =>
              track('directions', {
                source: 'home_rank',
                fuel: fuelType,
                permitNumber: row.station.permitNumber,
              })
            }
          >
            <Navigation className="h-3 w-3" />
            Ir
          </a>
        ) : (
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/35">
            {fuelLabel(fuelType)}
          </div>
        )}
      </div>
    </div>
  )
}

function fuelLabel(fuel: FuelType): string {
  if (fuel === 'regular') return 'Regular'
  if (fuel === 'premium') return 'Premium'
  if (fuel === 'diesel') return 'Diésel'
  return 'DUBA'
}
