import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import {
  listFavorites,
  setFavorite,
} from '#/features/community/transport/server-functions'

const LOCAL_FAVORITES_KEY = 'litrito:favorites:v1'

// --- localStorage as an external store -------------------------------------
// Reading localStorage during render would disagree with the server (which has
// none) and warn on hydration. useSyncExternalStore solves this the idiomatic
// way: getServerSnapshot feeds the SSR + first client render, then React swaps
// to the live value right after hydration — no manual effect, no mismatch.

const listeners = new Set<() => void>()
let snapshotCache: { raw: string | null; value: string[] } = { raw: null, value: [] }
const EMPTY: string[] = []

function parse(raw: string | null): string[] {
  try {
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
  } catch {
    return []
  }
}

function getSnapshot(): string[] {
  const raw = (() => {
    try {
      return window.localStorage.getItem(LOCAL_FAVORITES_KEY)
    } catch {
      return null
    }
  })()
  // Cache by raw string so the snapshot ref is stable between unchanged reads.
  if (raw === snapshotCache.raw) return snapshotCache.value
  snapshotCache = { raw, value: parse(raw) }
  return snapshotCache.value
}

function getServerSnapshot(): string[] {
  return EMPTY
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange) // cross-tab updates
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function writeLocal(favorites: string[]) {
  try {
    window.localStorage.setItem(
      LOCAL_FAVORITES_KEY,
      JSON.stringify(Array.from(new Set(favorites))),
    )
  } catch {
    // ignore (e.g. private mode)
  }
  // `storage` only fires in *other* tabs, so notify this tab's subscribers too.
  listeners.forEach((l) => l())
}

function useLocalFavorites(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// True only after hydration — without an effect. Server and the first client
// render return false; React re-renders with true once hydrated.
const noopSubscribe = () => () => {}
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

function updateList(favorites: string[], permitNumber: string, favorited: boolean): string[] {
  const set = new Set(favorites)
  if (favorited) set.add(permitNumber)
  else set.delete(permitNumber)
  return Array.from(set)
}

export type ToggleResult = { favorited: boolean; message: string }

/**
 * Favorites kept in localStorage and, when signed in, mirrored to PostgreSQL.
 * Shared by the home table and the station detail page so they stay in sync.
 */
export function useFavorites() {
  const session = authClient.useSession()
  const sessionUser = session?.data?.user ?? null
  const isAuthenticated = Boolean(sessionUser)
  const queryClient = useQueryClient()
  const localFavorites = useLocalFavorites()
  const hydrated = useIsHydrated()
  const syncedUserIdRef = useRef<string | null>(null)
  const remoteQuery = useQuery({
    queryKey: ['convexQuery', 'favorites:list', {}],
    queryFn: () => listFavorites(),
    enabled: isAuthenticated,
  })
  const remoteFavorites = useMemo(() => remoteQuery.data ?? [], [remoteQuery.data])

  const favoriteSet = useMemo(
    () => new Set([...remoteFavorites, ...localFavorites]),
    [remoteFavorites, localFavorites],
  )

  // Favorite state is knowable once the browser store is loaded and, for signed-in
  // users, the remote list has resolved. Consumers gate UI on this to avoid a
  // wrong-state flash.
  const ready = hydrated && (isAuthenticated ? remoteQuery.data !== undefined : true)

  // On sign-in, push any browser-only favorites up to the account once.
  useEffect(() => {
    const userId = sessionUser?.id ?? null
    // Wait for the Better Auth session before syncing browser-only favorites.
    if (!userId || !isAuthenticated) {
      if (!userId) syncedUserIdRef.current = null
      return
    }
    if (syncedUserIdRef.current === userId) return
    const remote = new Set(remoteFavorites)
    const unsynced = localFavorites.filter((p) => !remote.has(p))
    if (!unsynced.length) {
      syncedUserIdRef.current = userId
      return
    }
    Promise.all(
      unsynced.map((p) => setFavorite({ data: { stationPermitNumber: p, favorited: true } })),
    )
      .then(() => {
        syncedUserIdRef.current = userId
      })
      .catch(() => undefined)
  }, [remoteFavorites, localFavorites, sessionUser?.id, isAuthenticated])

  async function toggleFavorite(permitNumber: string): Promise<ToggleResult> {
    const favorited = !favoriteSet.has(permitNumber)
    writeLocal(updateList(getSnapshot(), permitNumber, favorited))
    if (!sessionUser) {
      return {
        favorited,
        message: favorited
          ? 'Guardada en este navegador. Inicia sesion para sincronizarla.'
          : 'Quitada de tus favoritas locales.',
      }
    }
    try {
      await setFavorite({ data: { stationPermitNumber: permitNumber, favorited } })
      await queryClient.invalidateQueries({ queryKey: ['convexQuery', 'favorites:list', {}] })
    } catch {
      return {
        favorited,
        message: 'No se pudo sincronizar con tu cuenta, pero quedo local.',
      }
    }
    return {
      favorited,
      message: favorited ? 'Favorita guardada.' : 'Favorita removida.',
    }
  }

  return {
    favoriteSet,
    ready,
    isFavorite: (permitNumber: string) => favoriteSet.has(permitNumber),
    toggleFavorite,
  }
}
