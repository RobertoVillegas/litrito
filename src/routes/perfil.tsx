import { ClientOnly, createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery as useReactQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo } from 'react'
import Avatar from 'boring-avatars'
import { CalendarClock, LogOut, MapPin, Star } from 'lucide-react'
import {
  cancelAccountDeletion,
  myAccountDeletion,
} from '#/features/community/transport/server-functions'
import { publicQueryOptions } from '#/features/public-data/react/query-options'
import { authClient } from '#/lib/auth-client'
import { useFavorites } from '#/lib/useFavorites'
import { Button } from '#/components/ui/button'
import { useToast } from '#/components/ui/toast'
import { DeleteAccount } from '../components/DeleteAccount'
import { MapSkeleton } from '../components/Skeleton'
import { StationTable, type StationRow } from '../components/StationTable'
import { getConfiguredSiteOrigin } from '../lib/site-url'
import { boundsOfLatLngs } from '../components/mapGeo'
import type { MapFocus } from '../components/mapGeo'
import type { FuelType } from '../components/StationFilters'

const StationMap = lazy(() =>
  import('../components/StationMap').then((m) => ({ default: m.StationMap })),
)

export const Route = createFileRoute('/perfil')({
  head: () => {
    const title = 'Mi perfil - Litrito'
    const description = 'Gestiona tu cuenta, consulta tus gasolineras favoritas, revisa precios actualizados y administra tus preferencias en Litrito.'
    const origin = getConfiguredSiteOrigin()
    const url = origin ? `${origin}/perfil` : undefined
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      ...(url ? { links: [{ rel: 'canonical', href: url }] } : {}),
    }
  },
  component: Profile,
})

const AVATAR_COLORS = ['#e60000', '#25282b', '#7e7e7e', '#bebebe', '#ffffff']
const FUEL_TYPES: FuelType[] = ['regular', 'premium', 'diesel', 'duba']

type FavoriteRow = {
  station: {
    permitNumber: string
    name: string
    address: string
    municipalityName?: string
    stateName?: string
    latitude?: number
    longitude?: number
  }
  prices: Partial<Record<FuelType, { price: number }>>
  highlightedPrice: number | null
}

function Profile() {
  const navigate = useNavigate()
  const session = authClient.useSession()
  const user = session?.data?.user ?? null
  const queryClient = useQueryClient()

  // /perfil requires a session. Once the session resolves with no user (direct
  // visit or right after sign-out), send them to sign in.
  useEffect(() => {
    if (!session.isPending && !user) {
      void navigate({ to: '/entrar', replace: true })
    }
  }, [session.isPending, user, navigate])

  const { favoriteSet, toggleFavorite } = useFavorites()
  const toast = useToast()
  const deletionQuery = useReactQuery({
    queryKey: ['convexQuery', 'accountDeletion:myDeletion', {}],
    queryFn: () => myAccountDeletion(),
    enabled: Boolean(user),
  })
  const deletion = deletionQuery.data

  async function handleCancelDeletion() {
    try {
      await cancelAccountDeletion()
      await queryClient.invalidateQueries({
        queryKey: ['convexQuery', 'accountDeletion:myDeletion', {}],
      })
      toast.add({
        title: 'Eliminación cancelada',
        description: 'Tu cuenta y tus datos se conservan.',
        type: 'success',
      })
    } catch {
      toast.add({ title: 'No se pudo cancelar', type: 'error' })
    }
  }

  const permitNumbers = useMemo(() => [...favoriteSet], [favoriteSet])
  const { data: favoriteRows } = useReactQuery({
    ...publicQueryOptions.stationsByPermits({ permitNumbers }),
    enabled: permitNumbers.length > 0,
  }) as { data: FavoriteRow[] | undefined }

  const rows = useMemo<StationRow[]>(
    () =>
      (favoriteRows ?? []).map((r) => ({
        station: {
          permitNumber: r.station.permitNumber,
          name: r.station.name,
          address: r.station.address,
          municipalityName: r.station.municipalityName,
          stateName: r.station.stateName,
          latitude: r.station.latitude,
          longitude: r.station.longitude,
        },
        prices: r.prices,
        highlightedPrice: r.highlightedPrice,
      })),
    [favoriteRows],
  )

  const mappableRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          typeof r.station.latitude === 'number' &&
          typeof r.station.longitude === 'number',
      ),
    [rows],
  )

  const mapFocus = useMemo<MapFocus | null>(() => {
    const b = boundsOfLatLngs(mappableRows.map((r) => r.station))
    return b ? { key: `fav:${mappableRows.length}`, type: 'bounds', bounds: b } : null
  }, [mappableRows])

  // Hold an empty shell while the session resolves or the redirect runs, so the
  // signed-out state never renders here.
  if (session.isPending || !user) {
    return <main className="min-h-screen" />
  }

  return (
    <main className="min-h-screen">
      <section className="bg-ink text-on-dark">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Avatar
              size={56}
              name={user?.email ?? user?.name ?? 'litrito'}
              variant="marble"
              colors={AVATAR_COLORS}
            />
            <div>
              <div className="eyebrow text-white/50">Tu perfil</div>
              <h1 className="font-display text-3xl text-white sm:text-4xl">
                {user.name ?? user.email}
              </h1>
              {user.email && (
                <div className="text-sm text-white/60">{user.email}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!deletion && <DeleteAccount email={user.email} />}
            <Button variant="outline-white" onClick={() => void authClient.signOut()}>
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        {deletion && (
          <div className="rounded-[6px] border border-line border-l-4 border-l-brand bg-canvas-soft px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-sm font-semibold text-ink">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  Tu cuenta se eliminará el {formatDeletionDate(deletion.scheduledAt)}.
                </span>
              </div>
              <Button variant="outline-red" size="sm" onClick={() => void handleCancelDeletion()}>
                Cancelar eliminación
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-brand" fill="currentColor" />
          <h2 className="eyebrow text-body">
            Favoritas · {permitNumbers.length}
          </h2>
        </div>

        {permitNumbers.length === 0 ? (
          <div className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center">
            <p className="text-sm text-body">
              Aún no tienes gasolineras favoritas. Marca la estrella en cualquier
              estación para guardarla aquí.
            </p>
            <Button render={<Link to="/" />} className="mt-4">
              Explorar gasolineras
            </Button>
          </div>
        ) : (
          <>
            {mappableRows.length > 0 && (
              <div className="overflow-hidden rounded-[6px] border border-line bg-white">
                <div className="flex items-center gap-2 border-b border-line bg-canvas-soft p-4">
                  <MapPin className="h-4 w-4 text-brand" />
                  <h3 className="font-display text-lg text-ink">
                    Tus favoritas en el mapa
                  </h3>
                </div>
                <ClientOnly fallback={<MapSkeleton className="m-3" />}>
                  <Suspense fallback={<MapSkeleton className="m-3" />}>
                    <div className="p-3">
                      <StationMap
                        rows={rows}
                        primaryFuel="regular"
                        fuelTypes={FUEL_TYPES}
                        focus={mapFocus}
                      />
                    </div>
                  </Suspense>
                </ClientOnly>
              </div>
            )}

            <StationTable
              rows={rows}
              fuelTypes={FUEL_TYPES}
              sortMode="price"
              isLoading={favoriteRows === undefined}
              canLoadMore={false}
              isLoadingMore={false}
              onLoadMore={() => undefined}
              onToggleFavorite={(p) => void toggleFavorite(p)}
              favoriteSet={favoriteSet}
            />
          </>
        )}
      </section>
    </main>
  )
}

function formatDeletionDate(scheduledAt: number | string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(
    new Date(scheduledAt),
  )
}
