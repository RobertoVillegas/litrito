import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useMemo } from 'react'
import Avatar from 'boring-avatars'
import { LogOut, Star } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { authClient } from '#/lib/auth-client'
import { useFavorites } from '#/lib/useFavorites'
import { StationTable, type StationRow } from '../components/StationTable'
import type { FuelType } from '../components/StationFilters'

export const Route = createFileRoute('/perfil')({ component: Profile })

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
  const session = authClient.useSession()
  const user = session?.data?.user ?? null
  const { favoriteSet, toggleFavorite } = useFavorites()

  const permitNumbers = useMemo(() => [...favoriteSet], [favoriteSet])
  const favoriteRows = useQuery(
    api.stations.getStationsByPermits,
    permitNumbers.length ? { permitNumbers } : 'skip',
  ) as FavoriteRow[] | undefined

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
                {user ? (user.name ?? user.email) : 'Invitado'}
              </h1>
              {user?.email && (
                <div className="text-sm text-white/60">{user.email}</div>
              )}
            </div>
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => void authClient.signOut()}
              className="btn-pill border border-white/40 text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          ) : (
            <Link to="/entrar" className="btn-pill btn-pill--primary">
              Entrar
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        {!user && permitNumbers.length > 0 && (
          <div className="rounded-[6px] border border-line border-l-4 border-l-brand bg-canvas-soft px-4 py-3 text-sm font-semibold text-ink">
            Tus favoritas están guardadas en este navegador.{' '}
            <Link to="/entrar" className="text-brand hover:text-brand-dark">
              Inicia sesión
            </Link>{' '}
            para sincronizarlas.
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
            <Link to="/" className="btn-pill btn-pill--primary mt-4">
              Explorar gasolineras
            </Link>
          </div>
        ) : (
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
            userLocation={null}
          />
        )}
      </section>
    </main>
  )
}
