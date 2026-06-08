import { getApproximateLocation, reverseGeocode } from '../geolocation'
import {
  FALLBACK_LOCATION,
  useUserLocationStore,
  type UserLocation,
} from './store'

export async function loadApproximateLocation() {
  try {
    const approx = await getApproximateLocation({ data: {} })
    useUserLocationStore.getState().setApproximateLocation({
      latitude: approx.latitude,
      longitude: approx.longitude,
      source: 'ip',
      city: approx.city,
      region: approx.region,
    })
  } catch {
    useUserLocationStore.getState().setApproximateLocation(FALLBACK_LOCATION)
  }
}

export function restoreRememberedPreciseLocation(location: UserLocation) {
  useUserLocationStore.getState().setPreciseLocation(location)
}

export function readFreshPreciseLocation() {
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
