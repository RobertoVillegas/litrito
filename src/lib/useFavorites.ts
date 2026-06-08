import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { authClient } from '#/lib/auth-client'

const LOCAL_FAVORITES_KEY = 'litrito:favorites:v1'

function readLocal(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOCAL_FAVORITES_KEY)
    const favorites = raw ? JSON.parse(raw) : []
    if (!Array.isArray(favorites)) return []
    return favorites.filter(
      (f): f is string => typeof f === 'string' && f.trim().length > 0,
    )
  } catch {
    return []
  }
}

function writeLocal(favorites: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    LOCAL_FAVORITES_KEY,
    JSON.stringify(Array.from(new Set(favorites))),
  )
}

function updateList(
  favorites: string[],
  permitNumber: string,
  favorited: boolean,
): string[] {
  const set = new Set(favorites)
  if (favorited) set.add(permitNumber)
  else set.delete(permitNumber)
  return Array.from(set)
}

export type ToggleResult = { favorited: boolean; message: string }

/**
 * Favorites kept in localStorage and, when signed in, mirrored to Convex.
 * Shared by the home table and the station detail page so they stay in sync.
 */
export function useFavorites() {
  const session = authClient.useSession()
  const sessionUser = session?.data?.user ?? null
  const [localFavorites, setLocalFavorites] = useState<string[]>(readLocal)
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null)
  const remoteFavorites = (useQuery(
    api.favorites.list,
    sessionUser ? {} : 'skip',
  ) ?? []) as string[]
  const setFavorite = useMutation(api.favorites.set)

  useEffect(() => {
    writeLocal(localFavorites)
  }, [localFavorites])

  const favoriteSet = useMemo(
    () => new Set([...remoteFavorites, ...localFavorites]),
    [remoteFavorites, localFavorites],
  )

  // On sign-in, push any browser-only favorites up to the account once.
  useEffect(() => {
    const userId = sessionUser?.id ?? null
    if (!userId) {
      setSyncedUserId(null)
      return
    }
    if (syncedUserId === userId) return
    const remote = new Set(remoteFavorites)
    const unsynced = localFavorites.filter((p) => !remote.has(p))
    if (!unsynced.length) {
      setSyncedUserId(userId)
      return
    }
    Promise.all(
      unsynced.map((p) => setFavorite({ stationPermitNumber: p, favorited: true })),
    )
      .then(() => setSyncedUserId(userId))
      .catch(() => undefined)
  }, [remoteFavorites, localFavorites, sessionUser?.id, setFavorite, syncedUserId])

  async function toggleFavorite(permitNumber: string): Promise<ToggleResult> {
    const favorited = !favoriteSet.has(permitNumber)
    setLocalFavorites((current) => updateList(current, permitNumber, favorited))
    if (!sessionUser) {
      return {
        favorited,
        message: favorited
          ? 'Guardada en este navegador. Inicia sesion para sincronizarla.'
          : 'Quitada de tus favoritas locales.',
      }
    }
    try {
      await setFavorite({ stationPermitNumber: permitNumber, favorited })
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
    isFavorite: (permitNumber: string) => favoriteSet.has(permitNumber),
    toggleFavorite,
  }
}
