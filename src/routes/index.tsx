import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { ArrowRight, Fuel, LocateFixed, MapPin, Navigation } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { RouteErrorFallback } from '../components/RouteError'
import { SiteFooter } from '../components/SiteFooter'
import { Button } from '#/components/ui/button'
import { DarkSkeleton, MapSkeleton, SkeletonLine } from '../components/Skeleton'
import { useUserLocation } from '#/lib/useUserLocation'
import { track } from '#/lib/analytics'
import { slugifyLocationName } from '#/lib/slug'
import { AnimatedPrice } from '../components/AnimatedNumber'
import { formatDistance } from '#/lib/format'
import { getConfiguredSiteOrigin } from '../lib/site-url'
import { buildSeoMeta } from '../lib/seo'
import { useLocationPermissionFlow } from '../components/LocationPermissionDialog'
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

type FilterOptionsResult = {
  states: { externalId: string; name: string; count: number }[]
}

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const filterOptions = await context.queryClient.ensureQueryData(
      context.convexQueryClient.queryOptions(api.stations.listFilterOptions, {}),
    )
    return { filterOptions }
  },
  head: () => {
    const title = 'Litrito - precios de gasolina en México'
    const description =
      'Compara precios por estación, municipio y estado. Regular, premium, diésel y duba, actualizados a diario.'
    const origin = getConfiguredSiteOrigin()
    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: 'Precios de gasolina en México.',
          subtitle:
            'Compara precios por estación, municipio y estado.\nRegular, premium, diésel y duba, actualizados a diario.',
        },
        url: origin || undefined,
      }),
      ...(origin ? { links: [{ rel: 'canonical', href: origin }] } : {}),
    }
  },
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

function Home() {
  const loaderData = Route.useLoaderData()
  const userLoc = useUserLocation()
  const { requestWithExplanation, dialogElement } = useLocationPermissionFlow()
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
  const filterOptions = useQuery(
    api.stations.listFilterOptions,
    {},
  ) as FilterOptionsResult | undefined
  const seoFilterOptions =
    filterOptions ?? (loaderData.filterOptions as FilterOptionsResult | undefined)

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
                <Button
                  fullWidth
                  className="justify-center"
                  onClick={() => {
                    track('home_location_request', { fuel: fuelType, radiusKm })
                    void requestWithExplanation()
                  }}
                >
                  <LocateFixed className="h-4 w-4" />
                  {userLoc.hasPreciseLocation ? 'Actualizar ubicación' : 'Usar mi ubicación'}
                </Button>
                <Button
                  render={<Link to="/explorar" />}
                  variant="outline-white"
                  fullWidth
                  className="justify-center"
                >
                  Explorar estaciones
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {hasLocation && (
                <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white/55 sm:justify-start">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" />
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

      {dialogElement}

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
              <MapSkeleton />
            }
          >
            <Suspense
              fallback={
                <MapSkeleton />
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

      {seoFilterOptions?.states && seoFilterOptions.states.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-4">
            <h2 className="font-display text-2xl text-ink">
              Precios de gasolina por estado
            </h2>
            <p className="mt-1 text-sm font-semibold text-body">
              Consulta promedios, rangos y estaciones por entidad federativa.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {seoFilterOptions.states.map((state) => (
              <a
                key={state.externalId}
                href={`/estado/${slugifyLocationName(state.name)}`}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink transition hover:border-ink"
              >
                {state.name}
              </a>
            ))}
          </div>
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow text-white/45">Top 10</div>
          {/* clamp keeps the heading on a single line across device widths;
              tweak the min/preferred/max here to adjust the fit. */}
          <h2 className="font-display mt-1 whitespace-nowrap text-[clamp(1.05rem,4.5vw,1.5rem)] text-white">
            Mejores cerca de ti
          </h2>
        </div>
        <div className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-black text-white/70">
          {fuelLabel(fuelType)}
        </div>
      </div>

      {!hasLocation ? (
        <div className="mt-4 rounded-[6px] border border-dashed border-white/20 px-4 py-6 text-sm font-semibold leading-6 text-white/60">
          Comparte tu ubicación para ver estaciones dentro de {radiusKm} km.
        </div>
      ) : rows === undefined ? (
        <StationRankSkeletonList />
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

function StationRankSkeletonList() {
  return (
    <div className="mt-4 space-y-2" aria-label="Cargando mejores estaciones">
      {Array.from({ length: 10 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[6px] border border-white/10 bg-white/[0.04] p-3"
        >
          <DarkSkeleton className="h-8 w-8 rounded-full bg-white/18" />
          <div className="min-w-0">
            <SkeletonLine dark lead="h-5" bar="h-3.5" width="w-[min(100%,18rem)]" />
            <SkeletonLine dark lead="h-4" bar="h-3" width="w-[min(72%,12rem)]" className="mt-0.5" />
          </div>
          <div className="text-right">
            <SkeletonLine dark lead="h-6" bar="h-4" width="w-16" className="justify-end" />
            <SkeletonLine dark lead="h-5" bar="h-2.5" width="w-8" className="mt-1 justify-end" />
          </div>
        </div>
      ))}
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
          <AnimatedPrice value={row.price} />
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
