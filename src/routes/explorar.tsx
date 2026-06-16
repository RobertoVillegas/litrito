import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { usePaginatedQuery, useQuery as useConvexQuery } from 'convex/react'
import { BadgeCent, DatabaseZap, Fuel, Loader2, RefreshCw, Star } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { api } from '../../convex/_generated/api'
import { useUserLocation } from '#/lib/useUserLocation'
import { useFavorites } from '#/lib/useFavorites'
import { RouteErrorFallback } from '../components/RouteError'
import { SiteFooter } from '../components/SiteFooter'
import { MapSkeleton, Skeleton } from '../components/Skeleton'
import { track } from '#/lib/analytics'
import { getConfiguredSiteOrigin } from '../lib/site-url'
import { AnimatedPrice } from '../components/AnimatedNumber'
import { buildSeoMeta } from '../lib/seo'

import { StationFilters, type FilterState, type FuelType } from '../components/StationFilters'
import { StationTable, type StationRow } from '../components/StationTable'
import { boundsOfLatLngs } from '../components/mapGeo'
import type { MapBounds, MapFocus } from '../components/mapGeo'
import { useLocationPermissionFlow } from '../components/LocationPermissionDialog'

const FUEL_VALUES = ['regular', 'premium', 'diesel', 'duba'] as const
const SORT_VALUES = ['price', 'distance', 'name'] as const

type HomeSearch = {
  fuels?: string
  primary?: FuelType
  state?: string
  municipality?: string
  q?: string
  sort?: 'price' | 'distance' | 'name'
}

function readSearchString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(trimmed)
      return typeof parsed === 'string' && parsed.trim() ? parsed : undefined
    } catch {
      return trimmed.slice(1, -1) || undefined
    }
  }
  return trimmed
}

export const Route = createFileRoute('/explorar')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const fuels = readSearchString(search.fuels)
    const primaryValue = readSearchString(search.primary)
    const sortValue = readSearchString(search.sort)
    const primary =
      primaryValue && FUEL_VALUES.includes(primaryValue as FuelType)
        ? (primaryValue as FuelType)
        : undefined
    const sort =
      sortValue && SORT_VALUES.includes(sortValue as FilterState['sortMode'])
        ? (sortValue as FilterState['sortMode'])
        : undefined
    return {
      fuels,
      primary,
      state: readSearchString(search.state),
      municipality: readSearchString(search.municipality),
      q: readSearchString(search.q),
      sort,
    }
  },
  loaderDeps: () => ({}),
  loader: async ({ context }) => {
    const [filterOptions, latestRun] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.convexQueryClient.queryOptions(api.stations.listFilterOptions, {}),
      ),
      context.queryClient.ensureQueryData(
        context.convexQueryClient.queryOptions(api.prices.latestRun, {}),
      ),
    ])
    return { filterOptions, latestRun }
  },
  head: () => {
    const title = 'Explorar gasolineras - Litrito'
    const description =
      'Explora y filtra gasolineras de México por estado, municipio y combustible. Encuentra el mejor precio cerca de ti.'
    const origin = getConfiguredSiteOrigin()
    const url = origin ? `${origin}/explorar` : undefined
    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: 'Explora gasolineras en México.',
          subtitle: 'Filtra por estado, municipio, combustible, precio o distancia.',
        },
        url,
      }),
      ...(url ? { links: [{ rel: 'canonical', href: url }] } : {}),
    }
  },
  component: Explore,
  errorComponent: ExploreErrorBoundary,
})

// Without this, a thrown Convex query error bubbles to the root with no
// boundary, blanking the page and (because the query re-throws on every
// re-render) looping. We log the screen + active filters and show a recoverable
// fallback instead of a crash.
function ExploreErrorBoundary({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const search = Route.useSearch()
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      screen="explore"
      context={{ route: '/explorar', filters: search }}
    />
  )
}

const StationMap = lazy(() =>
  import('../components/StationMap').then((m) => ({ default: m.StationMap })),
)

const PAGE_SIZE = 50

type StationFromQuery = {
  station: {
    _id: string
    _creationTime: number
    placeId?: string
    permitNumber: string
    name: string
    address: string
    stateExternalId: string
    municipalityExternalId: string
    stateName?: string
    municipalityName?: string
    latitude?: number
    longitude?: number
    source: 'CNE'
    firstSeenAt: string
    lastSeenAt: string
  }
  prices: Record<string, { price: number } | undefined>
  highlightedPrice: number | null
  distanceKm?: number | null
  enrichment?: {
    brand: string | null
    displayName: string | null
    source: string
  } | null
}

type BoundsStationsResult = {
  stations: StationFromQuery[]
  truncated: boolean
}

type FilterOption = {
  externalId: string
  name: string
  count: number
}

type FilterOptionsResult = {
  states: FilterOption[]
  municipalities: (FilterOption & { stateExternalId: string })[]
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Sin datos'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin datos'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const toRad = (d: number) => (d * Math.PI) / 180
function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const aa =
    sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aa)))
}

function defaultFilters(): FilterState {
  return {
    fuelTypes: ['regular', 'premium', 'diesel', 'duba'],
    primaryFuel: 'regular',
    stateIds: [],
    municipalityIds: [],
    search: '',
    sortMode: 'price',
  }
}

function parseFuelTypes(value: string | undefined): FuelType[] {
  if (!value) return defaultFilters().fuelTypes
  const selected = value
    .split(',')
    .filter((fuel): fuel is FuelType =>
      FUEL_VALUES.includes(fuel as FuelType),
    )
  return selected.length > 0 ? selected : defaultFilters().fuelTypes
}

function filtersFromSearch(
  search: HomeSearch,
  hasPreciseLocation: boolean,
): FilterState {
  const fuelTypes = parseFuelTypes(search.fuels)
  const primaryFuel =
    search.primary && fuelTypes.includes(search.primary)
      ? search.primary
      : fuelTypes[0]
  return {
    fuelTypes,
    primaryFuel,
    stateIds: search.state ? [search.state] : [],
    municipalityIds: search.municipality ? [search.municipality] : [],
    search: search.q ?? '',
    sortMode: search.sort ?? (hasPreciseLocation ? 'distance' : 'price'),
  }
}

function filtersToSearch(filters: FilterState): HomeSearch {
  return {
    fuels: filters.fuelTypes.join(','),
    primary: filters.primaryFuel,
    state: filters.stateIds[0],
    municipality: filters.municipalityIds[0],
    q: filters.search || undefined,
    sort: filters.sortMode,
  }
}

// Emit one analytics event per filter dimension that actually changed. Search
// is reported only when it crosses the "active" threshold so we don't fire on
// every keystroke.
function trackFilterChanges(prev: FilterState, next: FilterState) {
  if (prev.sortMode !== next.sortMode) {
    track('filter', { type: 'sort', value: next.sortMode })
  }
  if (prev.primaryFuel !== next.primaryFuel) {
    track('filter', { type: 'fuel', value: next.primaryFuel })
  }
  if (prev.stateIds[0] !== next.stateIds[0]) {
    track('filter', { type: 'state', value: next.stateIds[0] ?? 'all' })
  }
  if (prev.municipalityIds[0] !== next.municipalityIds[0]) {
    track('filter', {
      type: 'municipality',
      value: next.municipalityIds[0] ?? 'all',
    })
  }
  const prevActive = prev.search.trim().length >= 2
  const nextActive = next.search.trim().length >= 2
  if (!prevActive && nextActive) track('filter', { type: 'search' })
}

function Explore() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const loaderData = Route.useLoaderData()
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [notice, setNotice] = useState('')
  const userLoc = useUserLocation()
  const { requestWithExplanation, dialogElement } = useLocationPermissionFlow()
  const { favoriteSet, toggleFavorite } = useFavorites()

  const filterOptions =
    (loaderData.filterOptions as FilterOptionsResult | undefined) ?? {
      states: [],
      municipalities: [],
    }

  const filters = useMemo(
    () => filtersFromSearch(search, userLoc.hasPreciseLocation),
    [search, userLoc.hasPreciseLocation],
  )

  const setFilters = (next: FilterState | ((prev: FilterState) => FilterState)) => {
    const resolved = typeof next === 'function' ? next(filters) : next
    trackFilterChanges(filters, resolved)
    void navigate({
      search: () => filtersToSearch(resolved),
      replace: true,
      resetScroll: false,
    })
  }

  const listStationsArgs = {
    fuelTypes: filters.fuelTypes.length > 0 ? filters.fuelTypes : undefined,
    search: filters.search.length >= 2 ? filters.search : undefined,
    stateExternalIds: filters.stateIds.length > 0 ? filters.stateIds : undefined,
    municipalityExternalIds:
      filters.municipalityIds.length > 0 ? filters.municipalityIds : undefined,
    sortMode: filters.sortMode,
    userLocation:
      filters.sortMode === 'distance' && userLoc.location
        ? {
            latitude: userLoc.location.latitude,
            longitude: userLoc.location.longitude,
          }
        : undefined,
  }

  const paginated = usePaginatedQuery(
    api.stations.listStations,
    listStationsArgs,
    { initialNumItems: PAGE_SIZE },
  ) as {
    results: StationFromQuery[] | undefined
    status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
    loadMore: (n: number) => void
  }

  // In favorites-only mode the map is driven by the favorite stations directly
  // (see below), so the viewport query is skipped to avoid wasted reads.
  const boundsArgs =
    mapBounds && !showFavoritesOnly
      ? {
          fuelTypes: filters.fuelTypes.length > 0 ? filters.fuelTypes : undefined,
          stateExternalIds:
            filters.stateIds.length > 0 ? filters.stateIds : undefined,
          municipalityExternalIds:
            filters.municipalityIds.length > 0
              ? filters.municipalityIds
              : undefined,
          swLat: mapBounds.swLat,
          swLon: mapBounds.swLon,
          neLat: mapBounds.neLat,
          neLon: mapBounds.neLon,
          limit: 800,
        }
      : ('skip' as const)
  const boundsResult = useConvexQuery(
    api.stations.listStationsInBounds,
    boundsArgs,
  ) as BoundsStationsResult | undefined
  const [lastBoundsResult, setLastBoundsResult] =
    useState<BoundsStationsResult | null>(null)

  useEffect(() => {
    if (boundsResult) setLastBoundsResult(boundsResult)
  }, [boundsResult])
  const effectiveBoundsResult = boundsResult ?? lastBoundsResult

  // All favorite stations (with coords + prices), regardless of viewport.
  // Powers both the favorites-only map and table so nothing is missed just
  // because it falls outside the loaded pages or the current bounds.
  // `favoriteSet` is a fresh Set each render; derive a content key so the query
  // args stay referentially stable. Without this, the map's frequent re-renders
  // hand Convex a new args object every time and the subscription never settles.
  const favoriteKey = useMemo(() => [...favoriteSet].sort().join('|'), [favoriteSet])
  const favoritePermits = useMemo(
    () => (favoriteKey ? favoriteKey.split('|') : []),
    [favoriteKey],
  )
  const favoriteArgs = useMemo(
    () =>
      favoritePermits.length
        ? { permitNumbers: favoritePermits }
        : ('skip' as const),
    [favoritePermits],
  )
  const favoriteStations = useConvexQuery(
    api.stations.getStationsByPermits,
    favoriteArgs,
  ) as StationFromQuery[] | undefined

  const latestRun = loaderData.latestRun

  const displayDistanceForStation = useCallback((
    row: StationFromQuery,
  ): number | null | undefined => {
    if (row.distanceKm != null) return row.distanceKm
    if (filters.sortMode !== 'distance' || !userLoc.location) return row.distanceKm
    const lat = row.station.latitude
    const lon = row.station.longitude
    if (typeof lat !== 'number' || typeof lon !== 'number') return row.distanceKm
    return distanceKm(userLoc.location, { latitude: lat, longitude: lon })
  }, [filters.sortMode, userLoc.location])

  const visibleRows = useMemo<StationRow[]>(() => {
    if (!paginated.results) return []
    return paginated.results.map((row) => ({
      station: {
        permitNumber: row.station.permitNumber,
        name:
          row.enrichment?.displayName ||
          row.enrichment?.brand ||
          row.station.name,
        address: row.station.address,
        municipalityName: row.station.municipalityName,
        stateName: row.station.stateName,
        latitude: row.station.latitude,
        longitude: row.station.longitude,
      },
      prices: row.prices as Partial<Record<FuelType, { price: number }>>,
      highlightedPrice: row.highlightedPrice,
      distanceKm: displayDistanceForStation(row),
    }))
  }, [paginated.results, displayDistanceForStation])

  const favoriteRows = useMemo<StationRow[]>(() => {
    if (!favoriteStations) return []
    return favoriteStations.map((row) => ({
      station: {
        permitNumber: row.station.permitNumber,
        name: row.station.name,
        address: row.station.address,
        municipalityName: row.station.municipalityName,
        stateName: row.station.stateName,
        latitude: row.station.latitude,
        longitude: row.station.longitude,
      },
      prices: row.prices as Partial<Record<FuelType, { price: number }>>,
      highlightedPrice: row.highlightedPrice,
      distanceKm: row.distanceKm,
    }))
  }, [favoriteStations])

  const mapRows = useMemo<StationRow[]>(() => {
    if (showFavoritesOnly) return favoriteRows
    if (!effectiveBoundsResult) return []
    return effectiveBoundsResult.stations.map((row) => ({
      station: {
        permitNumber: row.station.permitNumber,
        name: row.station.name,
        address: row.station.address,
        municipalityName: row.station.municipalityName,
        stateName: row.station.stateName,
        latitude: row.station.latitude,
        longitude: row.station.longitude,
      },
      prices: row.prices as Partial<Record<FuelType, { price: number }>>,
      highlightedPrice: row.highlightedPrice,
      distanceKm: row.distanceKm,
    }))
  }, [effectiveBoundsResult, showFavoritesOnly, favoriteRows])

  const tableRows = showFavoritesOnly ? favoriteRows : visibleRows
  const listIsLoadingFirstPage =
    !showFavoritesOnly && paginated.status === 'LoadingFirstPage'
  const tableIsLoading =
    showFavoritesOnly
      ? favoriteStations === undefined && favoritePermits.length > 0
      : !paginated.results
  const tableIsRefreshing =
    !showFavoritesOnly &&
    listIsLoadingFirstPage &&
    Boolean(paginated.results) &&
    tableRows.length > 0
  const mapIsLoading =
    showFavoritesOnly
      ? favoriteStations === undefined && favoritePermits.length > 0
      : Boolean(mapBounds) && boundsResult === undefined

  const selectedStateId = filters.stateIds[0]
  const selectedMuniId = filters.municipalityIds[0]
  // Bounding box of the picked state/municipality, computed server-side from
  // station coords (independent of the paginated list). Drives the map framing.
  const areaBounds = useConvexQuery(
    api.stations.areaBounds,
    selectedStateId
      ? {
          stateExternalId: selectedStateId,
          ...(selectedMuniId
            ? { municipalityExternalId: selectedMuniId }
            : {}),
        }
      : ('skip' as const),
  ) as MapBounds | null | undefined
  const mapFocusIsLoading = Boolean(selectedStateId) && areaBounds === undefined

  // Map framing priority: a favorites view, then an explicit state/municipality
  // selection (which wins over GPS — picking a place should take you there),
  // then your own location. Each yields a stable key so the map re-frames only
  // when the intent changes.
  const mapFocus = useMemo<MapFocus | null>(() => {
    if (showFavoritesOnly) {
      const b = boundsOfLatLngs(favoriteRows.map((r) => r.station))
      return b ? { key: 'favorites', type: 'bounds', bounds: b } : null
    }

    // Frame the selected municipality (most specific) or state. `force`
    // re-frames even when the target is inside the current view, so
    // estado → municipio actually zooms in.
    if (selectedStateId && areaBounds) {
      const key = selectedMuniId
        ? `muni:${selectedMuniId}`
        : `state:${selectedStateId}`
      return { key, type: 'bounds', bounds: areaBounds, force: true }
    }

    if (!selectedStateId && userLoc.hasPreciseLocation && userLoc.location) {
      const { latitude, longitude } = userLoc.location
      return {
        key: `user:${latitude.toFixed(3)},${longitude.toFixed(3)}`,
        type: 'point',
        lat: latitude,
        lon: longitude,
      }
    }
    return null
  }, [
    showFavoritesOnly,
    favoriteRows,
    userLoc.hasPreciseLocation,
    userLoc.location,
    selectedStateId,
    selectedMuniId,
    areaBounds,
  ])

  async function handleToggleFavorite(permitNumber: string) {
    const result = await toggleFavorite(permitNumber)
    track('favorite', { on: result.favorited })
    setNotice(result.message)
  }

  const bestPrice = useMemo(() => {
    let min: number | null = null
    for (const row of visibleRows) {
      const p = row.highlightedPrice
      if (p == null) continue
      if (min == null || p < min) min = p
    }
    return min
  }, [visibleRows])

  // Keep the previous best price visible while new data loads so the metric
  // doesn't flash to a placeholder.
  const [lastBestPrice, setLastBestPrice] = useState<number | null>(null)
  useEffect(() => {
    if (bestPrice != null) setLastBestPrice(bestPrice)
  }, [bestPrice])
  const staleBestPrice = bestPrice ?? lastBestPrice

  const updatedAt = latestRun?.finishedAt ?? latestRun?.startedAt

  const statesForFilter = useMemo(
    () => filterOptions.states.filter((s) => s.count > 0),
    [filterOptions.states],
  )
  const munisForFilter = useMemo(
    () => filterOptions.municipalities.filter((m) => m.count > 0),
    [filterOptions.municipalities],
  )

  return (
    <main className="min-h-screen">
      <section className="bg-ink text-on-dark">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_280px] lg:px-8">
          <div className="flex flex-col justify-between gap-10">
            <div>
              <div className="eyebrow mb-6 inline-flex items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
                <Fuel className="h-4 w-4" />
                Gasolina y diésel · México
              </div>
              <h1 className="font-display text-6xl text-white sm:text-8xl">
                Explorar
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-light leading-8 text-white/70">
                Busca por nombre o zona, compara combustibles, revisa el mapa y
                ordena el catálogo completo por precio, distancia o nombre.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                icon={<DatabaseZap className="h-5 w-5" />}
                label="Fuente"
                value="CNE"
              />
              <Metric
                icon={<RefreshCw className="h-5 w-5" />}
                label="Actualización"
                value={formatDate(updatedAt)}
              />
              <Metric
                icon={<BadgeCent className="h-5 w-5" />}
                label="Mejor precio"
                value={
                  staleBestPrice ? (
                    <span className="inline-flex items-center gap-2">
                      <AnimatedPrice value={staleBestPrice} />
                      {paginated.status === 'LoadingFirstPage' && (
                        <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                      )}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
            </div>
          </div>

          <aside className="self-end rounded-[6px] border border-white/15 bg-white/[0.04] p-4">
            <div className="eyebrow text-white/50">Datos</div>
            <div className="mt-3 divide-y divide-white/10">
              <HeroFact label="Cobertura" value="Nacional" />
              <HeroFact label="Combustibles" value="Regular, Premium, Diésel" />
              <HeroFact label="Orden" value="Precio o cercanía" />
            </div>
            <div className="mt-4 text-xs leading-5 text-white/45">
              <a
                href="https://www.cne.gob.mx/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white underline decoration-white/30 underline-offset-2 hover:text-brand"
              >
                Fuente CNE
              </a>
              {' '}con precios informativos reportados por permisionarios.
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <StationFilters
          state={filters}
          states={statesForFilter}
          municipalities={munisForFilter}
          onChange={setFilters}
          hasPreciseLocation={userLoc.hasPreciseLocation}
          onRequestPreciseLocation={() => void requestWithExplanation()}
        />

        {(tableIsLoading || tableIsRefreshing) && (
          <div className="rounded-[6px] border border-brand/20 bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-ink">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-brand" />
              {userLoc.hasPreciseLocation && filters.sortMode === 'distance'
                ? 'Ordenando estaciones por cercanía con tu ubicación…'
                : 'Actualizando resultados con los filtros activos…'}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-body">
            {paginated.results
              ? `${visibleRows.length} ${
                  paginated.status === 'Exhausted' ? 'resultados' : 'cargados'
                }${paginated.status === 'CanLoadMore' ? ' — hay más' : ''}`
              : <Skeleton className="h-4 w-40" />}
            {showFavoritesOnly && (
              <span className="ml-2 text-brand">· solo favoritas</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFavoritesOnly((v) => !v)}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-bold transition ${
              showFavoritesOnly
                ? 'border-ink bg-ink text-white'
                : 'border-ink/25 bg-white text-ink hover:border-ink'
            }`}
          >
            <Star className="h-3.5 w-3.5" />
            {showFavoritesOnly ? 'Mostrar todo' : 'Solo favoritas'}
          </button>
        </div>

        {notice && (
          <div className="rounded-[6px] border border-line border-l-4 border-l-brand bg-canvas-soft px-4 py-3 text-sm font-semibold text-ink">
            {notice}
          </div>
        )}

        <div className="overflow-hidden rounded-[6px] border border-line bg-white">
          <div className="border-b border-line bg-canvas-soft p-4">
            <h3 className="font-display text-lg text-ink">Mapa</h3>
            <div className="mt-1 text-xs font-semibold text-body">
              {showFavoritesOnly ? (
                favoriteStations || favoritePermits.length === 0 ? (
                  `${mapRows.length} ${mapRows.length === 1 ? 'favorita' : 'favoritas'} en el mapa`
                ) : (
                  <Skeleton className="h-4 w-44" />
                )
              ) : effectiveBoundsResult ? (
                `${effectiveBoundsResult.stations.length} estaciones visibles${effectiveBoundsResult.truncated ? ' (acércate para más)' : ''}`
              ) : (
                <Skeleton className="h-4 w-44" />
              )}
            </div>
          </div>
          <ClientOnly
            fallback={
              <MapSkeleton className="m-3" />
            }
          >
            <Suspense
              fallback={
                <MapSkeleton className="m-3" />
              }
            >
              <div className="p-3">
                <StationMap
                  rows={mapRows}
                  primaryFuel={filters.primaryFuel}
                  fuelTypes={filters.fuelTypes}
                  userLocation={userLoc.location}
                  truncated={!showFavoritesOnly && effectiveBoundsResult?.truncated}
                  focus={mapFocus}
                  initialBounds={mapBounds}
                  loading={mapIsLoading || mapFocusIsLoading}
                  onMoveEnd={setMapBounds}
                  onLocateClick={() => {
                    void requestWithExplanation()
                    setFilters((prev) =>
                      prev.sortMode === 'distance' &&
                      prev.stateIds.length === 0 &&
                      prev.municipalityIds.length === 0
                        ? prev
                        : {
                            ...prev,
                            stateIds: [],
                            municipalityIds: [],
                            sortMode: 'distance',
                          },
                    )
                  }}
                />
              </div>
            </Suspense>
          </ClientOnly>
        </div>

        <StationTable
          rows={tableRows}
          fuelTypes={filters.fuelTypes}
          sortMode={filters.sortMode}
          isLoading={tableIsLoading}
          isRefreshing={tableIsRefreshing}
          canLoadMore={!showFavoritesOnly && paginated.status === 'CanLoadMore'}
          isLoadingMore={!showFavoritesOnly && paginated.status === 'LoadingMore'}
          onLoadMore={() => paginated.loadMore(PAGE_SIZE)}
          onSortModeChange={(sortMode) => setFilters((prev) => ({ ...prev, sortMode }))}
          onFuelSortChange={(fuelType) =>
            setFilters((prev) => ({
              ...prev,
              sortMode: 'price',
              primaryFuel: fuelType,
              fuelTypes: [fuelType, ...prev.fuelTypes.filter((ft) => ft !== fuelType)],
            }))
          }
          onToggleFavorite={handleToggleFavorite}
          favoriteSet={favoriteSet}
        />
      </section>

      {dialogElement}

      <SiteFooter className="mt-6" />
    </main>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-[6px] border border-white/15 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/50">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-bold text-white">{value}</div>
    </div>
  )
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
        {label}
      </span>
      <span className="text-right text-xs font-bold text-white/80">{value}</span>
    </div>
  )
}
