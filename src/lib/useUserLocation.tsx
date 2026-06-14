import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import {
  getPreciseLocationPermissionState,
  loadApproximateLocation,
  readFreshPreciseLocation,
  restoreRememberedPreciseLocation,
  type PreciseLocationPermissionState,
} from './location/service'
import { useUserLocationStore } from './location/store'

export function UserLocationProvider({ children }: { children: ReactNode }) {
  const rememberedPreciseLocation = useUserLocationStore(
    (state) => state.rememberedPreciseLocation,
  )
  const requestedFreshPrecise = useRef(false)

  useEffect(() => {
    if (rememberedPreciseLocation) {
      restoreRememberedPreciseLocation(rememberedPreciseLocation)
    }
  }, [rememberedPreciseLocation])

  useEffect(() => {
    if (!rememberedPreciseLocation || requestedFreshPrecise.current) return
    requestedFreshPrecise.current = true
    void getPreciseLocationPermissionState().then((permission) => {
      if (permission === 'granted') {
        void readFreshPreciseLocation()
      }
    })
  }, [rememberedPreciseLocation])

  useEffect(() => {
    void loadApproximateLocation()
  }, [])

  return <>{children}</>
}

export type LocationRequestIntent =
  | { action: 'request' }
  | { action: 'explain'; permission: PreciseLocationPermissionState }

export function useUserLocation() {
  const location = useUserLocationStore((state) => state.location)
  const preciseAttempted = useUserLocationStore(
    (state) => state.preciseAttempted,
  )
  const preciseError = useUserLocationStore((state) => state.preciseError)
  const requestPrecise = useCallback(() => readFreshPreciseLocation(), [])
  const getPrecisePermission = useCallback(
    () => getPreciseLocationPermissionState(),
    [],
  )
  const preparePreciseRequest =
    useCallback(async (): Promise<LocationRequestIntent> => {
      const permission = await getPreciseLocationPermissionState()
      if (permission === 'granted') {
        return { action: 'request' }
      }
      return { action: 'explain', permission }
    }, [])

  return {
    location,
    getPrecisePermission,
    preparePreciseRequest,
    requestPrecise,
    hasPreciseLocation: location?.source === 'precise',
    preciseAttempted,
    preciseError,
  }
}
