import { useEffect, useState } from 'react'
import { getApproximateLocation } from './geolocation'

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
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setPreciseAttempted(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation((prev) =>
          prev
            ? {
                ...prev,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                source: 'precise',
                city: prev.city,
                region: prev.region,
              }
            : {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                source: 'precise',
                city: null,
                region: null,
              },
        )
      },
      () => {
        // Permiso denegado o falló: nos quedamos con la IP.
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  }

  return {
    location,
    requestPrecise,
    hasPreciseLocation: location?.source === 'precise',
    preciseAttempted,
  }
}
