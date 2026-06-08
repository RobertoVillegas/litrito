import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import {
  BadgeCent,
  DatabaseZap,
  Fuel,
  LogOut,
  RefreshCw,
  Star,
  UserCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { lazy, Suspense } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api } from '../../convex/_generated/api'
import { authClient } from '#/lib/auth-client'
import { useUserLocation } from '#/lib/useUserLocation'
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

const LOCAL_FAVORITES_KEY = 'litrito:favorites:v1'

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

function readLocalFavoritePermitNumbers(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOCAL_FAVORITES_KEY)
    const favorites = raw ? JSON.parse(raw) : []
    if (!Array.isArray(favorites)) return []
    return favorites.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
  } catch {
    return []
  }
}

function writeLocalFavoritePermitNumbers(favorites: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    LOCAL_FAVORITES_KEY,
    JSON.stringify(Array.from(new Set(favorites))),
  )
}

function updateFavoriteList(
  favorites: string[],
  permitNumber: string,
  favorited: boolean,
): string[] {
  const set = new Set(favorites)
  if (favorited) set.add(permitNumber)
  else set.delete(permitNumber)
  return Array.from(set)
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
  const [localFavoritePermitNumbers, setLocalFavoritePermitNumbers] = useState(
    readLocalFavoritePermitNumbers,
  )
  const [syncedFavoriteUserId, setSyncedFavoriteUserId] = useState<string | null>(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [notice, setNotice] = useState('')
  const session = authClient.useSession()
  const userLoc = useUserLocation()

  useEffect(() => {
    writeLocalFavoritePermitNumbers(localFavoritePermitNumbers)
  }, [localFavoritePermitNumbers])

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
  const sessionUser = session?.data?.user ?? null
  const favoritePermitNumbers =
    (useQuery(api.favorites.list, sessionUser ? {} : 'skip') ?? []) as string[]
  const setFavorite = useMutation(api.favorites.set)
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

  const favoriteSet = useMemo(
    () => new Set([...favoritePermitNumbers, ...localFavoritePermitNumbers]),
    [favoritePermitNumbers, localFavoritePermitNumbers],
  )

  useEffect(() => {
    const userId = sessionUser?.id ?? null
    if (!userId) {
      setSyncedFavoriteUserId(null)
      return
    }
    if (syncedFavoriteUserId === userId) return

    const remoteFavorites = new Set(favoritePermitNumbers)
    const unsyncedFavorites = localFavoritePermitNumbers.filter(
      (p) => !remoteFavorites.has(p),
    )
    if (!unsyncedFavorites.length) {
      setSyncedFavoriteUserId(userId)
      return
    }

    Promise.all(
      unsyncedFavorites.map((p) => setFavorite({ stationPermitNumber: p, favorited: true })),
    )
      .then(() => setSyncedFavoriteUserId(userId))
      .catch(() => undefined)
  }, [
    favoritePermitNumbers,
    localFavoritePermitNumbers,
    sessionUser?.id,
    setFavorite,
    syncedFavoriteUserId,
  ])

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
    const favorited = !favoriteSet.has(permitNumber)
    setLocalFavoritePermitNumbers((current) =>
      updateFavoriteList(current, permitNumber, favorited),
    )
    if (!sessionUser) {
      setNotice(
        favorited
          ? 'Guardada en este navegador. Inicia sesion para sincronizarla.'
          : 'Quitada de tus favoritas locales.',
      )
      return
    }
    try {
      await setFavorite({ stationPermitNumber: permitNumber, favorited })
    } catch {
      setNotice('No se pudo sincronizar con tu cuenta, pero quedo local.')
      return
    }
    setNotice(favorited ? 'Favorita guardada.' : 'Favorita removida.')
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
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
          <div className="flex flex-col justify-between gap-8">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900">
                <Fuel className="h-4 w-4" />
                Precios por litro, sin drama
              </div>
              <h1 className="max-w-3xl text-5xl font-black tracking-normal text-slate-950 sm:text-6xl">
                Litrito
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
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

          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2 text-sm font-bold uppercase text-slate-500">
              <span>Datos</span>
              <button
                type="button"
                onClick={() => void handleRefreshCatalog()}
                className="inline-flex items-center gap-1 text-[10px] font-bold normal-case text-emerald-700 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Reimportar catalogo
              </button>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Fuente: Comision Nacional de Energia, precios reportados por
              permisionarios. Son informativos y pueden cambiar en estacion.
            </p>

            <div className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
              {userLoc.location ? (
                <>
                  {userLoc.location.source === 'precise' ? (
                    <span>
                      <strong className="text-emerald-800">Ubicacion precisa</strong>
                      {userLoc.location.city ? ` · ${userLoc.location.city}` : ''}
                    </span>
                  ) : (
                    <span>
                      <strong className="text-slate-700">
                        {userLoc.location.source === 'ip'
                          ? 'Ubicacion aproximada'
                          : 'Ubicacion por defecto'}
                      </strong>
                      {userLoc.location.city ? ` · ${userLoc.location.city}` : ''}
                      {' '}
                      <button
                        type="button"
                        onClick={userLoc.requestPrecise}
                        className="ml-1 font-bold text-emerald-700 hover:underline"
                      >
                        usar mi ubicacion
                      </button>
                    </span>
                  )}
                  {userLoc.preciseError && (
                    <p className="mt-1 text-rose-600">{userLoc.preciseError}</p>
                  )}
                </>
              ) : (
                <span>Detectando tu ubicacion…</span>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <AuthPanel />

        <StationFilters
          state={filters}
          states={statesForFilter}
          municipalities={munisForFilter}
          onChange={setFilters}
          hasPreciseLocation={userLoc.hasPreciseLocation}
          onRequestPreciseLocation={userLoc.requestPrecise}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-600">
            {paginated.results
              ? `${visibleRows.length} ${
                  paginated.status === 'Exhausted' ? 'resultados' : 'cargados'
                }${paginated.status === 'CanLoadMore' ? ' — hay más' : ''}`
              : 'Cargando…'}
            {showFavoritesOnly && (
              <span className="ml-2 text-amber-700">· solo favoritas</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowFavoritesOnly((v) => !v)}
              className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-bold transition ${
                showFavoritesOnly
                  ? 'border-amber-500 bg-amber-50 text-amber-950'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-amber-400'
              }`}
            >
              <Star className="h-3.5 w-3.5" />
              {showFavoritesOnly ? 'Mostrar todo' : 'Solo favoritas'}
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshMunicipality()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-emerald-400"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refrescar municipio
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            {notice}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-black text-slate-950">Mapa</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
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
    </main>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-black text-slate-950">{value}</div>
    </div>
  )
}

function AuthPanel() {
  const session = authClient.useSession()
  const sessionUser = session?.data?.user ?? null
  const isPending = session?.isPending ?? false
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    try {
      if (mode === 'signin') {
        await authClient.signIn.email({ email, password })
      } else {
        await authClient.signUp.email({
          email,
          password,
          name: name || email.split('@')[0] || 'Litrito',
        })
      }
      setPassword('')
    } catch {
      setMessage('No se pudo completar el acceso. Revisa tus datos.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
  }

  if (isPending) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Cargando sesion…
      </div>
    )
  }

  if (sessionUser) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-slate-700">
          <UserCircle className="h-5 w-5 text-emerald-700" />
          Hola, {sessionUser.name ?? sessionUser.email}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-950"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesion
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
    >
      <label className="block">
        <span className="text-xs font-bold uppercase text-slate-500">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase text-slate-500">
          {mode === 'signup' ? 'Nombre (opcional)' : 'Contrasena'}
        </span>
        {mode === 'signup' ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          />
        ) : (
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          />
        )}
      </label>
      {mode === 'signup' && (
        <label className="block">
          <span className="text-xs font-bold uppercase text-slate-500">Contrasena</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
      >
        {submitting ? 'Enviando…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
      </button>
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
        className="text-xs font-bold text-emerald-700 hover:underline sm:col-span-4 sm:text-right"
      >
        {mode === 'signin' ? 'Crear cuenta' : 'Ya tengo cuenta'}
      </button>
      {message && (
        <p className="text-sm font-semibold text-rose-700 sm:col-span-4">{message}</p>
      )}
    </form>
  )
}
