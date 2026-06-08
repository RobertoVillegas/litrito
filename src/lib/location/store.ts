import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type UserLocation = {
  latitude: number
  longitude: number
  source: 'ip' | 'precise' | 'fallback'
  city: string | null
  region: string | null
}

export const FALLBACK_LOCATION: UserLocation = {
  latitude: 19.4326,
  longitude: -99.1332,
  source: 'fallback',
  city: 'Ciudad de México',
  region: 'CDMX',
}

type UserLocationStore = {
  location: UserLocation | null
  rememberedPreciseLocation: UserLocation | null
  preciseAttempted: boolean
  preciseError: string | null
  setApproximateLocation: (location: UserLocation) => void
  setPreciseLocation: (location: UserLocation) => void
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

export const useUserLocationStore = create<UserLocationStore>()(
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
