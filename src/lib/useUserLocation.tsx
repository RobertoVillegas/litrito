import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import {
  loadApproximateLocation,
  readFreshPreciseLocation,
  restoreRememberedPreciseLocation,
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
    readFreshPreciseLocation()
  }, [rememberedPreciseLocation])

  useEffect(() => {
    void loadApproximateLocation()
  }, [])

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
