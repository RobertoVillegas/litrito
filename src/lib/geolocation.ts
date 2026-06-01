import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'

const IP_CACHE_TTL_MS = 24 * 60 * 60 * 1000

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
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,lat,longitude,city,region,country`,
      { headers: { accept: 'application/json' } },
    )
    if (!response.ok) return null
    const body = (await response.json()) as {
      success: boolean
      lat?: number
      longitude?: number
      city?: string
      region?: string
      country?: string
    }
    if (!body.success) return null
    if (typeof body.lat !== 'number' || typeof body.longitude !== 'number') {
      return null
    }
    return {
      ip,
      latitude: body.lat,
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
