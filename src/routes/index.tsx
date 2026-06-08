import { createFileRoute } from '@tanstack/react-router'
import { useAction, usePaginatedQuery, useQuery } from 'convex/react'
import { BadgeCent, DatabaseZap, Fuel, RefreshCw, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { api } from '../../convex/_generated/api'
import { useUserLocation } from '#/lib/useUserLocation'
import { useFavorites } from '#/lib/useFavorites'
import { StationFilters, type FilterState, type FuelType } from '../components/StationFilters'
import { StationTable, type StationRow } from '../components/StationTable'
import type { MapBounds } from '../components/StationMap'

export const Route = createFileRoute('/')({ component: Home })

const StationMap = lazy(() =>
  import('../components/StationMap').then((m) => ({ default: m.StationMap })),
)

function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <>{fallback ?? null}</>
  return <>{children}</>
}

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
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

function Home() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [notice, setNotice] = useState('')
  const userLoc = useUserLocation()
  const { favoriteSet, toggleFavorite } = useFavorites()

  const filterOptions =
    (useQuery(api.stations.listFilterOptions, {}) as FilterOptionsResult | undefined) ?? {
      states: [],
      municipalities: [],
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

  const boundsArgs = mapBounds
    ? {
        fuelTypes: filters.fuelTypes.length > 0 ? filters.fuelTypes : undefined,
        swLat: mapBounds.swLat,
        swLon: mapBounds.swLon,
        neLat: mapBounds.neLat,
        neLon: mapBounds.neLon,
        limit: 800,
      }
    : 'skip' as const
  const boundsResult = useQuery(
    api.stations.listStationsInBounds,
    boundsArgs,
  ) as
    | {
        stations: StationFromQuery[]
        truncated: boolean
      }
    | undefined

  const latestRun = useQuery(api.prices.latestRun)
  const refreshCatalog = useAction(api.ingestion.refreshCatalog)
  const refreshMunicipality = useAction(api.ingestion.refreshMunicipality)

  const visibleRows = useMemo<StationRow[]>(() => {
    if (!paginated.results) return []
    return paginated.results.map((row) => ({
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
    }))
  }, [paginated.results])

  const mapRows = useMemo<StationRow[]>(() => {
    if (!boundsResult) return []
    return boundsResult.stations.map((row) => ({
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
    }))
  }, [boundsResult])

  const tableRows = useMemo(() => {
    if (!showFavoritesOnly) return visibleRows
    return visibleRows.filter((r) => favoriteSet.has(r.station.permitNumber))
  }, [visibleRows, showFavoritesOnly, favoriteSet])

  const distanceByPermit = useMemo(() => {
    if (filters.sortMode !== 'distance' || !userLoc.location) return undefined
    const ul = userLoc.location
    const map = new Map<string, number>()
    for (const row of visibleRows) {
      const lat = row.station.latitude
      const lon = row.station.longitude
      if (typeof lat === 'number' && typeof lon === 'number') {
        map.set(row.station.permitNumber, distanceKm(ul, { latitude: lat, longitude: lon }))
      }
    }
    return map
  }, [visibleRows, filters.sortMode, userLoc.location])

  async function handleToggleFavorite(permitNumber: string) {
    const result = await toggleFavorite(permitNumber)
    setNotice(result.message)
  }

  async function handleRefreshCatalog() {
    setNotice('')
    try {
      await refreshCatalog({})
      setNotice('Catalogo CNE actualizado.')
    } catch {
      setNotice('No se pudo actualizar el catalogo CNE.')
    }
  }

  async function handleRefreshMunicipality() {
    if (filters.stateIds.length !== 1) {
      setNotice('Elige un solo estado y municipio para forzar la actualizacion.')
      return
    }
    const muni = filters.municipalityIds[0]
    const [stateExternalId, municipalityExternalId] = (muni ?? '').split('|')
    if (!stateExternalId || !municipalityExternalId) {
      setNotice('Selecciona un municipio especifico para actualizar.')
      return
    }
    setNotice('')
    try {
      const result = await refreshMunicipality({ stateExternalId, municipalityExternalId })
      setNotice(`Listo: ${result.recordsWritten} precios actualizados.`)
    } catch {
      setNotice('La fuente CNE no respondio. Conservamos los ultimos datos.')
    }
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
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
          <div className="flex flex-col justify-between gap-10">
            <div>
              <div className="eyebrow mb-6 inline-flex items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
                <Fuel className="h-4 w-4" />
                Precios por litro, sin drama
              </div>
              <h1 className="font-display text-7xl text-white sm:text-8xl">
                Litrito
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-light leading-8 text-white/70">
                Encuentra donde cargar gasolina y diesel en Mexico con precios
                reportados por estacion. Filtra por zona, busca por nombre y
                compara por combustible.
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
                label="Actualizacion"
                value={formatDate(updatedAt)}
              />
              <Metric
                icon={<BadgeCent className="h-5 w-5" />}
                label="Mejor precio"
                value={bestPrice ? formatCurrency(bestPrice) : 'Sin datos'}
              />
            </div>
          </div>

          <aside className="rounded-[6px] border border-white/15 bg-white/[0.04] p-5">
            <div className="eyebrow flex items-center justify-between gap-2 text-white/50">
              <span>Datos</span>
              <button
                type="button"
                onClick={() => void handleRefreshCatalog()}
                className="inline-flex items-center gap-1 text-[10px] font-bold normal-case tracking-normal text-brand hover:text-white"
              >
                <RefreshCw className="h-3 w-3" />
                Reimportar catalogo
              </button>
            </div>

            <p className="mt-3 text-sm leading-6 text-white/60">
              Fuente: Comision Nacional de Energia, precios reportados por
              permisionarios. Son informativos y pueden cambiar en estacion.
            </p>

            <p className="mt-4 text-xs leading-5 text-white/40">
              Tu ubicacion se detecta en automatico — actívala con precisión
              desde la barra de arriba para ordenar por cercanía.
            </p>
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
          onRequestPreciseLocation={userLoc.requestPrecise}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-body">
            {paginated.results
              ? `${visibleRows.length} ${
                  paginated.status === 'Exhausted' ? 'resultados' : 'cargados'
                }${paginated.status === 'CanLoadMore' ? ' — hay más' : ''}`
              : 'Cargando…'}
            {showFavoritesOnly && (
              <span className="ml-2 text-brand">· solo favoritas</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
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
            <button
              type="button"
              onClick={() => void handleRefreshMunicipality()}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-ink/25 bg-white px-4 text-xs font-bold text-ink transition hover:border-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refrescar municipio
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-[6px] border border-line border-l-4 border-l-brand bg-canvas-soft px-4 py-3 text-sm font-semibold text-ink">
            {notice}
          </div>
        )}

        <div className="overflow-hidden rounded-[6px] border border-line bg-white">
          <div className="border-b border-line bg-canvas-soft p-4">
            <h3 className="font-display text-lg text-ink">Mapa</h3>
            <p className="mt-1 text-xs font-semibold text-body">
              {boundsResult
                ? `${boundsResult.stations.length} estaciones visibles${boundsResult.truncated ? ' (acercate para mas)' : ''}`
                : 'Cargando marcadores…'}
            </p>
          </div>
          <ClientOnly
            fallback={
              <div className="m-3 flex h-[55vh] min-h-[320px] items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
                Cargando mapa…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="m-3 flex h-[55vh] min-h-[320px] items-center justify-center text-sm text-slate-500">
                  Cargando mapa…
                </div>
              }
            >
              <div className="p-3">
                <StationMap
                  rows={mapRows}
                  primaryFuel={filters.primaryFuel}
                  fuelTypes={filters.fuelTypes}
                  userLocation={userLoc.location}
                  truncated={boundsResult?.truncated}
                  initialBounds={mapBounds}
                  onMoveEnd={setMapBounds}
                  onLocateClick={() => {
                    setFilters((prev) =>
                      prev.sortMode === 'distance'
                        ? prev
                        : { ...prev, sortMode: 'distance' },
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
          isLoading={!paginated.results}
          canLoadMore={paginated.status === 'CanLoadMore'}
          isLoadingMore={paginated.status === 'LoadingMore'}
          onLoadMore={() => paginated.loadMore(PAGE_SIZE)}
          onToggleFavorite={handleToggleFavorite}
          favoriteSet={favoriteSet}
          userLocation={
            userLoc.location
              ? {
                  latitude: userLoc.location.latitude,
                  longitude: userLoc.location.longitude,
                }
              : null
          }
          distanceByPermit={distanceByPermit}
        />
      </section>

      <footer className="mt-6 bg-ink text-on-dark">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-10 sm:px-6 lg:px-8">
          <div className="font-display text-3xl text-white">Litrito</div>
          <p className="max-w-xl text-sm leading-6 text-white/60">
            Precios informativos reportados por permisionarios a la Comision
            Nacional de Energia. Pueden cambiar en estacion.
          </p>
          <p className="eyebrow mt-4 text-white/40">Hecho en Mexico · Fuente CNE</p>
        </div>
      </footer>
    </main>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
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
