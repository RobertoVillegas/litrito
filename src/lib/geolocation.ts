import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'

const IP_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const GEOLOOKUP_TIMEOUT_MS = 2_500

type CachedLocation = {
  ip: string
  latitude: number
  longitude: number
  city: string | null
  region: string | null
  country: string | null
  fetchedAt: number
}

const cache = new Map<string, CachedLocation>()

function fallbackLocation(): CachedLocation {
  return {
    ip: '0.0.0.0',
    latitude: 19.4326,
    longitude: -99.1332,
    city: 'Ciudad de México',
    region: 'CDMX',
    country: 'MX',
    fetchedAt: Date.now(),
  }
}

async function fetchIpLocation(ip: string): Promise<CachedLocation | null> {
  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,latitude,longitude,city,region,country`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(GEOLOOKUP_TIMEOUT_MS),
      },
    )
    if (!response.ok) return null
    const body = (await response.json()) as {
      success: boolean
      latitude?: number
      longitude?: number
      city?: string
      region?: string
      country?: string
    }
    if (!body.success) return null
    if (
      typeof body.latitude !== 'number' ||
      typeof body.longitude !== 'number'
    ) {
      return null
    }
    return {
      ip,
      latitude: body.latitude,
      longitude: body.longitude,
      city: body.city ?? null,
      region: body.region ?? null,
      country: body.country ?? null,
      fetchedAt: Date.now(),
    }
  } catch {
    return null
  }
}

export const getApproximateLocation = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ forceRefresh: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? '0.0.0.0'
    if (ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1') {
      return fallbackLocation()
    }
    if (!data.forceRefresh) {
      const cached = cache.get(ip)
      if (cached && Date.now() - cached.fetchedAt < IP_CACHE_TTL_MS) {
        return cached
      }
    }
    const fresh = await fetchIpLocation(ip)
    if (!fresh) return cache.get(ip) ?? fallbackLocation()
    cache.set(ip, fresh)
    return fresh
  })

// Turns precise GPS coordinates into a human-readable city/region so the UI can
// show where the user actually is instead of the stale IP-derived city.
export const reverseGeocode = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ latitude: z.number(), longitude: z.number() }))
  .handler(async ({ data }): Promise<{ city: string | null; region: string | null }> => {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse')
      url.searchParams.set('lat', String(data.latitude))
      url.searchParams.set('lon', String(data.longitude))
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('zoom', '12')
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Litrito/1.0 (+https://litrito.mx)',
        },
        signal: AbortSignal.timeout(GEOLOOKUP_TIMEOUT_MS),
      })
      if (!response.ok) return { city: null, region: null }
      const body = (await response.json()) as {
        address?: {
          city?: string
          town?: string
          village?: string
          municipality?: string
          county?: string
          state?: string
        }
      }
      const a = body.address ?? {}
      return {
        city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
        region: a.state ?? null,
      }
    } catch {
      return { city: null, region: null }
    }
  })
