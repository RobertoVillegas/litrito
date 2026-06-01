import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import {
  ArrowDownUp,
  BadgeCent,
  DatabaseZap,
  Fuel,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Star,
  UserCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api } from '../../convex/_generated/api'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/')({ component: Home })

const FUEL_OPTIONS = [
  { value: 'regular', label: 'Regular' },
  { value: 'premium', label: 'Premium' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'duba', label: 'Diesel DUBA' },
] as const

const LOCAL_FAVORITES_KEY = 'litrito:favorites:v1'

type FuelType = (typeof FUEL_OPTIONS)[number]['value']

type StateOption = {
  externalId: string
  name: string
}

type MunicipalityOption = {
  externalId: string
  name: string
}

type StationRow = {
  station: {
    permitNumber: string
    name: string
    address: string
    municipalityName?: string
    stateName?: string
    latitude?: number
    longitude?: number
  }
  prices: Partial<Record<FuelType | 'unknown', { price: number }>>
  highlightedPrice: number | null
}

type UserLocation = {
  latitude: number
  longitude: number
}

function readLocalFavoritePermitNumbers(): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawFavorites = window.localStorage.getItem(LOCAL_FAVORITES_KEY)
    const favorites = rawFavorites ? JSON.parse(rawFavorites) : []

    if (!Array.isArray(favorites)) {
      return []
    }

    return favorites.filter((favorite): favorite is string => {
      return typeof favorite === 'string' && favorite.trim().length > 0
    })
  } catch {
    return []
  }
}

function writeLocalFavoritePermitNumbers(favorites: string[]) {
  if (typeof window === 'undefined') {
    return
  }

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
  const favoriteSet = new Set(favorites)

  if (favorited) {
    favoriteSet.add(permitNumber)
  } else {
    favoriteSet.delete(permitNumber)
  }

  return Array.from(favoriteSet)
}

function Home() {
  const [stateExternalId, setStateExternalId] = useState('09')
  const [municipalityExternalId, setMunicipalityExternalId] = useState('')
  const [fuelType, setFuelType] = useState<FuelType>('regular')
  const [searchTerm, setSearchTerm] = useState('')
  const [localFavoritePermitNumbers, setLocalFavoritePermitNumbers] = useState(
    readLocalFavoritePermitNumbers,
  )
  const [syncedFavoriteUserId, setSyncedFavoriteUserId] = useState<
    string | null
  >(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [sortMode, setSortMode] = useState<'price' | 'distance'>('price')
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [catalogRefreshing, setCatalogRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const session = authClient.useSession()

  const states = (useQuery(api.catalog.states) ?? []) as StateOption[]
  const municipalities =
    (useQuery(api.catalog.municipalities, {
      stateExternalId,
    }) ?? []) as MunicipalityOption[]
  const latestRun = useQuery(api.prices.latestRun)
  const favoritePermitNumbers =
    (useQuery(api.favorites.list, session.data?.user ? {} : 'skip') ??
      []) as string[]
  const rows =
    (useQuery(api.prices.search, {
      stateExternalId,
      municipalityExternalId: municipalityExternalId || undefined,
      fuelType,
      q: searchTerm || undefined,
      limit: 80,
    }) ?? []) as StationRow[]

  const refreshCatalog = useAction(api.ingestion.refreshCatalog)
  const refreshMunicipality = useAction(api.ingestion.refreshMunicipality)
  const setFavorite = useMutation(api.favorites.set)

  useEffect(() => {
    if (!states.length && !catalogRefreshing) {
      setCatalogRefreshing(true)
      refreshCatalog({})
        .then(() => setNotice('Catalogo CNE listo para buscar.'))
        .catch(() =>
          setNotice('No se pudo cargar el catalogo CNE. Intenta otra vez.'),
        )
        .finally(() => setCatalogRefreshing(false))
    }
  }, [catalogRefreshing, refreshCatalog, states.length])

  useEffect(() => {
    if (!municipalityExternalId && municipalities[0]) {
      setMunicipalityExternalId(municipalities[0].externalId)
    }
  }, [municipalities, municipalityExternalId])

  useEffect(() => {
    writeLocalFavoritePermitNumbers(localFavoritePermitNumbers)
  }, [localFavoritePermitNumbers])

  useEffect(() => {
    const userId = session.data?.user?.id ?? null

    if (!userId) {
      setSyncedFavoriteUserId(null)
      return
    }

    if (syncedFavoriteUserId === userId) {
      return
    }

    const remoteFavorites = new Set(favoritePermitNumbers)
    const unsyncedFavorites = localFavoritePermitNumbers.filter(
      (permitNumber) => !remoteFavorites.has(permitNumber),
    )

    if (!unsyncedFavorites.length) {
      setSyncedFavoriteUserId(userId)
      return
    }

    Promise.all(
      unsyncedFavorites.map((stationPermitNumber) =>
        setFavorite({ stationPermitNumber, favorited: true }),
      ),
    )
      .then(() => {
        setSyncedFavoriteUserId(userId)
        setNotice('Favoritas locales sincronizadas con tu cuenta.')
      })
      .catch(() => {
        setNotice('Tus favoritas locales siguen guardadas en este navegador.')
      })
  }, [
    favoritePermitNumbers,
    localFavoritePermitNumbers,
    session.data?.user?.id,
    setFavorite,
    syncedFavoriteUserId,
  ])

  const selectedState = useMemo(
    () => states.find((state) => state.externalId === stateExternalId),
    [stateExternalId, states],
  )

  const selectedMunicipality = useMemo(
    () =>
      municipalities.find(
        (municipality) => municipality.externalId === municipalityExternalId,
      ),
    [municipalities, municipalityExternalId],
  )

  const bestPrice = rows[0]?.highlightedPrice
  const updatedAt = latestRun?.finishedAt ?? latestRun?.startedAt
  const favoriteSet = useMemo(
    () => new Set([...favoritePermitNumbers, ...localFavoritePermitNumbers]),
    [favoritePermitNumbers, localFavoritePermitNumbers],
  )
  const visibleRows = useMemo(() => {
    const filteredRows = showFavoritesOnly
      ? rows.filter((row) => favoriteSet.has(row.station.permitNumber))
      : rows

    if (sortMode !== 'distance' || !userLocation) {
      return filteredRows
    }

    return [...filteredRows].sort((a, b) => {
      const aDistance = distanceForStation(a, userLocation)
      const bDistance = distanceForStation(b, userLocation)
      return (
        (aDistance ?? Number.POSITIVE_INFINITY) -
          (bDistance ?? Number.POSITIVE_INFINITY) ||
        (a.highlightedPrice ?? Number.POSITIVE_INFINITY) -
          (b.highlightedPrice ?? Number.POSITIVE_INFINITY)
      )
    })
  }, [favoriteSet, rows, showFavoritesOnly, sortMode, userLocation])

  async function handleRefreshMunicipality() {
    if (!stateExternalId || !municipalityExternalId) {
      setNotice('Elige entidad y municipio para actualizar precios.')
      return
    }

    setRefreshing(true)
    setNotice('')

    try {
      const result = await refreshMunicipality({
        stateExternalId,
        municipalityExternalId,
      })
      setNotice(`Listo: ${result.recordsWritten} precios actualizados.`)
    } catch {
      setNotice('La fuente CNE no respondio. Conservamos los ultimos datos.')
    } finally {
      setRefreshing(false)
    }
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setNotice('Tu navegador no tiene geolocalizacion disponible.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setSortMode('distance')
        setNotice('Ordenando por estaciones cercanas a tu ubicacion.')
      },
      () => {
        setNotice('No pude obtener tu ubicacion. Puedes seguir comparando por precio.')
      },
      { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
    )
  }

  async function handleToggleFavorite(permitNumber: string) {
    const favorited = !favoriteSet.has(permitNumber)

    setLocalFavoritePermitNumbers((currentFavorites) =>
      updateFavoriteList(currentFavorites, permitNumber, favorited),
    )

    if (!session.data?.user) {
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
                reportados por estacion. Filtra por zona, compara por
                combustible y ordena del mas barato al mas caro.
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
            <div className="flex items-center gap-2 text-sm font-bold uppercase text-slate-500">
              <MapPin className="h-4 w-4" />
              Buscar por ubicacion
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Entidad
                </span>
                <select
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-emerald-500 transition focus:ring-2"
                  value={stateExternalId}
                  onChange={(event) => {
                    setStateExternalId(event.target.value)
                    setMunicipalityExternalId('')
                  }}
                >
                  {states.map((state) => (
                    <option key={state.externalId} value={state.externalId}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Municipio
                </span>
                <select
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-emerald-500 transition focus:ring-2"
                  value={municipalityExternalId}
                  onChange={(event) =>
                    setMunicipalityExternalId(event.target.value)
                  }
                >
                  {municipalities.map((municipality) => (
                    <option
                      key={municipality.externalId}
                      value={municipality.externalId}
                    >
                      {municipality.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                type="button"
                onClick={handleRefreshMunicipality}
                disabled={refreshing || !municipalityExternalId}
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
                {refreshing ? 'Actualizando...' : 'Actualizar municipio'}
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">
              Fuente: Comision Nacional de Energia, precios reportados por
              permisionarios. Son informativos y pueden cambiar en estacion.
            </p>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <AuthPanel />

        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-950">
              {selectedMunicipality?.name ?? 'Municipio'}{' '}
              {selectedState ? `, ${selectedState.name}` : ''}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {visibleRows.length} estaciones{' '}
              {sortMode === 'distance' ? 'cercanas' : 'ordenadas por precio'}{' '}
              de {FUEL_OPTIONS.find((option) => option.value === fuelType)?.label}.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative block sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none ring-emerald-500 transition placeholder:text-slate-400 focus:ring-2"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Estacion, permiso o direccion"
              />
            </label>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              {FUEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`h-10 rounded-md border px-3 text-sm font-bold transition ${
                    fuelType === option.value
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500'
                  }`}
                  type="button"
                  onClick={() => setFuelType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
              showFavoritesOnly
                ? 'border-amber-500 bg-amber-50 text-amber-950'
                : 'border-slate-300 bg-white text-slate-700 hover:border-amber-400'
            }`}
            type="button"
            onClick={() => setShowFavoritesOnly((value) => !value)}
          >
            <Star className="h-4 w-4" />
            Favoritas
          </button>
          <button
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
              sortMode === 'distance'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500'
            }`}
            type="button"
            onClick={handleUseLocation}
          >
            <LocateFixed className="h-4 w-4" />
            Cerca de mi
          </button>
          <button
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
              sortMode === 'price'
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
            }`}
            type="button"
            onClick={() => setSortMode('price')}
          >
            <ArrowDownUp className="h-4 w-4" />
            Precio
          </button>
        </div>

        {notice ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            {notice}
          </div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <StationMap rows={visibleRows} fuelType={fuelType} />

          <div className="grid grid-cols-[1fr_120px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-500 sm:grid-cols-[1.2fr_1fr_120px_120px_120px]">
            <div>Estacion</div>
            <div className="hidden sm:block">Ubicacion</div>
            <div className="flex items-center justify-end gap-1">
              <ArrowDownUp className="h-3.5 w-3.5" />
              Regular
            </div>
            <div className="hidden text-right sm:block">Premium</div>
            <div className="hidden text-right sm:block">Diesel</div>
          </div>

          {visibleRows.length ? (
            visibleRows.map((row) => (
              <article
                key={row.station.permitNumber}
                className="grid grid-cols-[1fr_120px] gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 sm:grid-cols-[1.2fr_1fr_120px_120px_120px]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${
                        favoriteSet.has(row.station.permitNumber)
                          ? 'border-amber-300 bg-amber-50 text-amber-600'
                          : 'border-slate-200 bg-white text-slate-400 hover:text-amber-500'
                      }`}
                      type="button"
                      title="Guardar favorita"
                      onClick={() => {
                        void handleToggleFavorite(row.station.permitNumber)
                      }}
                    >
                      <Star
                        className="h-4 w-4"
                        fill={
                          favoriteSet.has(row.station.permitNumber)
                            ? 'currentColor'
                            : 'none'
                        }
                      />
                    </button>
                    <h3 className="truncate text-sm font-black text-slate-950">
                      {row.station.name}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {row.station.permitNumber}
                  </p>
                </div>
                <div className="hidden min-w-0 sm:block">
                  <p className="truncate text-sm text-slate-700">
                    {row.station.address}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.station.municipalityName}, {row.station.stateName}
                  </p>
                  {userLocation ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <Navigation className="h-3 w-3" />
                      {formatDistance(distanceForStation(row, userLocation))}
                    </p>
                  ) : null}
                </div>
                <PriceCell active={fuelType === 'regular'} value={row.prices.regular?.price} />
                <PriceCell active={fuelType === 'premium'} value={row.prices.premium?.price} />
                <PriceCell
                  active={fuelType === 'diesel' || fuelType === 'duba'}
                  value={row.prices.diesel?.price ?? row.prices.duba?.price}
                  className="hidden sm:flex"
                />
              </article>
            ))
          ) : (
            <div className="px-4 py-12 text-center">
              <Fuel className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="mt-3 text-base font-black text-slate-950">
                Todavia no hay precios para esta busqueda
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Actualiza el municipio seleccionado para traer datos desde CNE y
                guardarlos en Convex.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function StationMap({
  rows,
  fuelType,
}: {
  rows: StationRow[]
  fuelType: FuelType
}) {
  const points = rows
    .filter(
      (row) =>
        typeof row.station.latitude === 'number' &&
        typeof row.station.longitude === 'number',
    )
    .slice(0, 80)

  if (!points.length) {
    return (
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-950">Mapa</h3>
            <p className="mt-1 text-sm text-slate-600">
              Actualiza ubicaciones con el XML `places` de CNE para ver
              estaciones en mapa.
            </p>
          </div>
          <MapPin className="h-5 w-5 text-slate-400" />
        </div>
      </div>
    )
  }

  const latitudes = points.map((row) => row.station.latitude as number)
  const longitudes = points.map((row) => row.station.longitude as number)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLon = Math.min(...longitudes)
  const maxLon = Math.max(...longitudes)
  const latSpan = Math.max(maxLat - minLat, 0.04)
  const lonSpan = Math.max(maxLon - minLon, 0.04)

  return (
    <div className="border-b border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-950">Mapa</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {points.length} estaciones con coordenadas CNE
          </p>
        </div>
        <MapPin className="h-5 w-5 text-emerald-700" />
      </div>
      <div className="relative h-72 overflow-hidden rounded-md border border-slate-200 bg-[linear-gradient(90deg,#e2e8f0_1px,transparent_1px),linear-gradient(#e2e8f0_1px,transparent_1px)] bg-[size:36px_36px]">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-sky-50" />
        {points.map((row) => {
          const latitude = row.station.latitude as number
          const longitude = row.station.longitude as number
          const left = 8 + ((longitude - minLon) / lonSpan) * 84
          const top = 8 + ((maxLat - latitude) / latSpan) * 84
          const price = row.prices[fuelType]?.price ?? row.highlightedPrice

          return (
            <div
              key={row.station.permitNumber}
              className="group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${left}%`, top: `${top}%` }}
              title={`${row.station.name} ${price ? formatCurrency(price) : ''}`}
            >
              <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-600 shadow-md shadow-slate-400/40 transition group-hover:scale-125" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AuthPanel() {
  const { data: session, isPending } = authClient.useSession()
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

  if (isPending) {
    return (
      <div className="mb-5 h-16 animate-pulse rounded-lg border border-slate-200 bg-white" />
    )
  }

  if (session?.user) {
    return (
      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <UserCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-950">
              {session.user.name || session.user.email}
            </p>
            <p className="text-sm text-slate-600">
              Tus favoritas se guardan con tu cuenta.
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-slate-500"
          type="button"
          onClick={() => {
            void authClient.signOut()
          }}
        >
          <LogOut className="h-4 w-4" />
          Salir
        </button>
      </div>
    )
  }

  return (
    <form
      className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
      onSubmit={handleSubmit}
    >
      <div className="lg:col-span-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-950">
              Guarda tus estaciones favoritas
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Crea una cuenta para seguir precios de estaciones concretas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
            <button
              className={`rounded px-3 py-2 text-sm font-bold ${
                mode === 'signin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
              }`}
              type="button"
              onClick={() => setMode('signin')}
            >
              Entrar
            </button>
            <button
              className={`rounded px-3 py-2 text-sm font-bold ${
                mode === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
              }`}
              type="button"
              onClick={() => setMode('signup')}
            >
              Crear
            </button>
          </div>
        </div>
      </div>

      {mode === 'signup' ? (
        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-emerald-500 transition placeholder:text-slate-400 focus:ring-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre"
        />
      ) : null}
      <input
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-emerald-500 transition placeholder:text-slate-400 focus:ring-2"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="correo@ejemplo.com"
        required
      />
      <input
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-emerald-500 transition placeholder:text-slate-400 focus:ring-2"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Contrasena"
        required
      />
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        type="submit"
        disabled={submitting}
      >
        <UserCircle className="h-4 w-4" />
        {submitting ? 'Enviando...' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
      </button>
      {message ? (
        <p className="text-sm font-semibold text-red-700 lg:col-span-4">
          {message}
        </p>
      ) : null}
    </form>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-black uppercase">{label}</span>
      </div>
      <div className="mt-2 text-lg font-black text-slate-950">{value}</div>
    </div>
  )
}

function PriceCell({
  active,
  value,
  className = '',
}: {
  active: boolean
  value?: number
  className?: string
}) {
  return (
    <div
      className={`items-center justify-end text-right text-sm font-black ${
        active ? 'text-emerald-700' : 'text-slate-800'
      } ${className || 'flex'}`}
    >
      {value ? formatCurrency(value) : '-'}
    </div>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatDate(value?: string) {
  if (!value) {
    return 'Pendiente'
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function distanceForStation(row: StationRow, location: UserLocation) {
  if (
    typeof row.station.latitude !== 'number' ||
    typeof row.station.longitude !== 'number'
  ) {
    return null
  }

  return distanceInKm(location, {
    latitude: row.station.latitude,
    longitude: row.station.longitude,
  })
}

function distanceInKm(a: UserLocation, b: UserLocation) {
  const earthRadiusKm = 6371
  const latDelta = toRadians(b.latitude - a.latitude)
  const lonDelta = toRadians(b.longitude - a.longitude)
  const latA = toRadians(a.latitude)
  const latB = toRadians(b.latitude)
  const haversine =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(latA) *
      Math.cos(latB) *
      Math.sin(lonDelta / 2) *
      Math.sin(lonDelta / 2)

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function formatDistance(value: number | null) {
  if (value === null) {
    return 'Sin coordenadas'
  }

  if (value < 1) {
    return `${Math.round(value * 1000)} m`
  }

  return `${value.toFixed(1)} km`
}
