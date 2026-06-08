import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { getApproximateLocation, reverseGeocode } from './geolocation'

type Location = {
  latitude: number
  longitude: number
  source: 'ip' | 'precise' | 'fallback'
  city: string | null
  region: string | null
}

const FALLBACK: Location = {
  latitude: 19.4326,
  longitude: -99.1332,
  source: 'fallback',
  city: 'Ciudad de México',
  region: 'CDMX',
}

type UserLocationStore = {
  location: Location | null
  rememberedPreciseLocation: Location | null
  preciseAttempted: boolean
  preciseError: string | null
  setApproximateLocation: (location: Location) => void
  setPreciseLocation: (location: Location) => void
  setPreciseError: (error: string | null) => void
  markPreciseAttempted: () => void
  forgetPreciseLocation: () => void
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function getLocationStorage(): StateStorage {
  if (typeof window === 'undefined') return noopStorage
  return window.localStorage
}

const useUserLocationStore = create<UserLocationStore>()(
  persist(
    (set) => ({
      location: null,
      rememberedPreciseLocation: null,
      preciseAttempted: false,
      preciseError: null,
      setApproximateLocation: (location) =>
        set((state) =>
          state.location?.source === 'precise'
            ? state
            : { location, preciseError: null },
        ),
      setPreciseLocation: (location) =>
        set({
          location,
          rememberedPreciseLocation: location,
          preciseAttempted: true,
          preciseError: null,
        }),
      setPreciseError: (error) => set({ preciseError: error }),
      markPreciseAttempted: () => set({ preciseAttempted: true }),
      forgetPreciseLocation: () =>
        set({
          rememberedPreciseLocation: null,
          preciseError: 'Permiso de ubicación denegado.',
        }),
    }),
    {
      name: 'litrito:user-location',
      storage: createJSONStorage(getLocationStorage),
      partialize: (state) => ({
        rememberedPreciseLocation: state.rememberedPreciseLocation,
      }),
    },
  ),
)

function readFreshPreciseLocation() {
  const {
    markPreciseAttempted,
    setPreciseError,
    setPreciseLocation,
    forgetPreciseLocation,
  } = useUserLocationStore.getState()

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    setPreciseError('Tu navegador no soporta geolocalización.')
    return
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    // getCurrentPosition is blocked outside HTTPS/localhost.
    setPreciseError(
      'La ubicación precisa requiere HTTPS (o localhost). Ábrela sobre HTTPS.',
    )
    return
  }

  markPreciseAttempted()
  setPreciseError(null)
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latitude = pos.coords.latitude
      const longitude = pos.coords.longitude
      setPreciseLocation({
        latitude,
        longitude,
        source: 'precise',
        city: null,
        region: null,
      })
      void reverseGeocode({ data: { latitude, longitude } })
        .then((info) => {
          const current = useUserLocationStore.getState().location
          if (current?.source !== 'precise') return
          setPreciseLocation({
            ...current,
            city: info.city,
            region: info.region,
          })
        })
        .catch(() => undefined)
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        forgetPreciseLocation()
        return
      }
      setPreciseError('No se pudo obtener tu ubicación precisa.')
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
  )
}

export function UserLocationProvider({ children }: { children: ReactNode }) {
  const rememberedPreciseLocation = useUserLocationStore(
    (state) => state.rememberedPreciseLocation,
  )
  const setApproximateLocation = useUserLocationStore(
    (state) => state.setApproximateLocation,
  )
  const setPreciseLocation = useUserLocationStore(
    (state) => state.setPreciseLocation,
  )
  const requestedFreshPrecise = useRef(false)

  useEffect(() => {
    if (rememberedPreciseLocation) {
      setPreciseLocation(rememberedPreciseLocation)
    }
  }, [rememberedPreciseLocation, setPreciseLocation])

  useEffect(() => {
    if (!rememberedPreciseLocation || requestedFreshPrecise.current) return
    requestedFreshPrecise.current = true
    readFreshPreciseLocation()
  }, [rememberedPreciseLocation])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const approx = await getApproximateLocation({ data: {} })
        if (cancelled) return
        setApproximateLocation({
          latitude: approx.latitude,
          longitude: approx.longitude,
          source: 'ip',
          city: approx.city,
          region: approx.region,
        })
      } catch {
        if (cancelled) return
        setApproximateLocation(FALLBACK)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setApproximateLocation])

  return <>{children}</>
}

export function useUserLocation() {
  const location = useUserLocationStore((state) => state.location)
  const preciseAttempted = useUserLocationStore(
    (state) => state.preciseAttempted,
  )
  const preciseError = useUserLocationStore((state) => state.preciseError)
  const requestPrecise = useCallback(() => readFreshPreciseLocation(), [])

  return {
    location,
    requestPrecise,
    hasPreciseLocation: location?.source === 'precise',
    preciseAttempted,
    preciseError,
  }
}
