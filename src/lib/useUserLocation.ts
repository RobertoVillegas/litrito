import { useEffect, useState } from 'react'
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

export function useUserLocation() {
  const [location, setLocation] = useState<Location | null>(null)
  const [preciseAttempted, setPreciseAttempted] = useState(false)
  const [preciseError, setPreciseError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const approx = await getApproximateLocation({ data: {} })
        if (cancelled) return
        setLocation({
          latitude: approx.latitude,
          longitude: approx.longitude,
          source: 'ip',
          city: approx.city,
          region: approx.region,
        })
      } catch {
        if (cancelled) return
        setLocation(FALLBACK)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const requestPrecise = () => {
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
    setPreciseAttempted(true)
    setPreciseError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude
        const longitude = pos.coords.longitude
        // Drop the stale IP-derived city until the reverse lookup resolves, so
        // the label never shows the wrong city for the precise coordinates.
        setLocation({ latitude, longitude, source: 'precise', city: null, region: null })
        void reverseGeocode({ data: { latitude, longitude } })
          .then((info) => {
            setLocation((prev) =>
              prev && prev.source === 'precise'
                ? { ...prev, city: info.city, region: info.region }
                : prev,
            )
          })
          .catch(() => undefined)
      },
      (err) => {
        setPreciseError(
          err.code === err.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado.'
            : 'No se pudo obtener tu ubicación precisa.',
        )
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  }

  return {
    location,
    requestPrecise,
    hasPreciseLocation: location?.source === 'precise',
    preciseAttempted,
    preciseError,
  }
}
