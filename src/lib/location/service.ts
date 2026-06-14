import { getApproximateLocation, reverseGeocode } from '../geolocation'
import {
  FALLBACK_LOCATION,
  useUserLocationStore,
  type UserLocation,
} from './store'

export type PreciseLocationPermissionState =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unsupported'
  | 'insecure'
  | 'unknown'

export type PreciseLocationRequestResult =
  | { status: 'requesting'; permission: PreciseLocationPermissionState }
  | { status: 'blocked'; permission: PreciseLocationPermissionState; message: string }

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

export async function getPreciseLocationPermissionState(): Promise<PreciseLocationPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unsupported'
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'insecure'
  }
  if (!navigator.permissions?.query) {
    return 'unknown'
  }

  try {
    const status = await navigator.permissions.query({
      name: 'geolocation' as PermissionName,
    })
    return status.state
  } catch {
    return 'unknown'
  }
}

export async function readFreshPreciseLocation(): Promise<PreciseLocationRequestResult> {
  const {
    markPreciseAttempted,
    setPreciseError,
    setPreciseLocation,
    forgetPreciseLocation,
  } = useUserLocationStore.getState()

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    const message = 'Tu navegador no soporta geolocalización.'
    setPreciseError(message)
    return { status: 'blocked', permission: 'unsupported', message }
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    const message =
      'La ubicación precisa requiere HTTPS (o localhost). Ábrela sobre HTTPS.'
    setPreciseError(message)
    return { status: 'blocked', permission: 'insecure', message }
  }

  const permission = await getPreciseLocationPermissionState()
  if (permission === 'denied') {
    const message = 'Permiso de ubicación denegado.'
    setPreciseError(message)
    return { status: 'blocked', permission, message }
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
  return { status: 'requesting', permission }
}
