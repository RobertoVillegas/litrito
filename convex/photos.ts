import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server'
import { api, internal } from './_generated/api'

const MAPILLARY_GRAPH_URL = 'https://graph.mapillary.com/images'
// How close a street-level image must be to count as "this station". Forecourt
// imagery on the road in front of the station sits within a few tens of meters.
const MAPILLARY_MATCH_METERS = 45
// The camera must actually be pointing at the station, not just be near it. We
// accept an image only when its heading is within this many degrees of the
// bearing from the camera to the station — otherwise the photo faces the street
// or the opposite side and shows no forecourt. Precision over recall: a station
// with no well-aimed capture gets 'none' (nothing) instead of a wrong photo.
const FACING_TOLERANCE_DEG = 45
// Re-check coverage at most this often for stations we found nothing for, so a
// 'none' result doesn't pin us forever as Mapillary's coverage grows.
const RECHECK_NONE_AFTER_MS = 1000 * 60 * 60 * 24 * 30
// National photo backfill: small batches with a pause between them so we stay
// gentle on Mapillary's rate limits. ~8 stations per ~2s ≈ under 1 req/s.
const PHOTO_BACKFILL_BATCH = 8
const PHOTO_BACKFILL_DELAY_MS = 2000

const toRad = (d: number) => (d * Math.PI) / 180
function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Compass bearing (degrees, 0=N) from point 1 to point 2.
function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon)
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
}

// Smallest absolute difference between two compass angles (0-180).
function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

// Public read: the cached photo state for a station. Returns 'unchecked' when we
// have not looked yet (the client then calls `ensureStationPhoto`), 'none' when
// Mapillary has no nearby coverage, or 'found' with a resolved image URL.
export const getStationPhoto = query({
  args: { permitNumber: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('stationPhotos')
      .withIndex('by_station', (q) =>
        q.eq('stationPermitNumber', args.permitNumber),
      )
      .unique()

    if (!row) return { status: 'unchecked' as const }
    if (row.status === 'none' || !row.storageId) {
      return { status: 'none' as const }
    }
    return {
      status: 'found' as const,
      source: row.source,
      url: await ctx.storage.getUrl(row.storageId),
      attribution: row.attribution ?? null,
      capturedAt: row.capturedAt ?? null,
    }
  },
})

export const photoFetchContext = internalQuery({
  args: { permitNumber: v.string() },
  handler: async (ctx, args) => {
    const station = await ctx.db
      .query('stations')
      .withIndex('by_permit', (q) =>
        q.eq('permitNumber', args.permitNumber),
      )
      .unique()
    const existing = await ctx.db
      .query('stationPhotos')
      .withIndex('by_station', (q) =>
        q.eq('stationPermitNumber', args.permitNumber),
      )
      .unique()
    return {
      latitude: station?.latitude ?? null,
      longitude: station?.longitude ?? null,
      existing: existing
        ? { status: existing.status, checkedAt: existing.checkedAt }
        : null,
    }
  },
})

export const writeStationPhoto = internalMutation({
  args: {
    permitNumber: v.string(),
    status: v.union(v.literal('found'), v.literal('none')),
    storageId: v.optional(v.id('_storage')),
    mapillaryImageId: v.optional(v.string()),
    attribution: v.optional(v.string()),
    capturedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('stationPhotos')
      .withIndex('by_station', (q) =>
        q.eq('stationPermitNumber', args.permitNumber),
      )
      .unique()
    const value = {
      stationPermitNumber: args.permitNumber,
      source: 'mapillary' as const,
      status: args.status,
      storageId: args.storageId,
      mapillaryImageId: args.mapillaryImageId,
      attribution: args.attribution,
      capturedAt: args.capturedAt,
      checkedAt: new Date().toISOString(),
    }
    if (existing) {
      // Drop a stale cached image when replacing it so storage doesn't leak.
      if (existing.storageId && existing.storageId !== args.storageId) {
        await ctx.storage.delete(existing.storageId)
      }
      await ctx.db.patch(existing._id, value)
    } else {
      await ctx.db.insert('stationPhotos', value)
    }
  },
})

export const listStationPermitsPage = internalQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('stations')
      .paginate({ cursor: args.cursor ?? null, numItems: args.numItems })
    return {
      permits: page.page.map((s) => s.permitNumber),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    }
  },
})

// Proactively cache a Mapillary photo for every station, nationwide. Self-
// reschedules in small batches with a delay between them to respect rate
// limits, and reuses ensureStationPhoto so already-cached stations are skipped
// (idempotent; safe to re-run). Pass maxBatches to bound a test run; omit it
// for the full national pass. Kick off: `bunx convex run photos:backfillStationPhotos '{}'`.
export const backfillStationPhotos = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    maxBatches: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; isDone: boolean }> => {
    if (!process.env.MAPILLARY_TOKEN) return { processed: 0, isDone: true }
    // Kill switch: set PHOTO_BACKFILL_PAUSED in Convex env to halt the chain
    // (it stops rescheduling). Unset to let a fresh run proceed.
    if (process.env.PHOTO_BACKFILL_PAUSED) return { processed: 0, isDone: true }
    const page = await ctx.runQuery(internal.photos.listStationPermitsPage, {
      cursor: args.cursor ?? null,
      numItems: PHOTO_BACKFILL_BATCH,
    })
    for (const permitNumber of page.permits) {
      await ctx.runAction(api.photos.ensureStationPhoto, { permitNumber })
    }
    const remaining =
      args.maxBatches === undefined ? undefined : args.maxBatches - 1
    if (!page.isDone && (remaining === undefined || remaining > 0)) {
      await ctx.scheduler.runAfter(
        PHOTO_BACKFILL_DELAY_MS,
        internal.photos.backfillStationPhotos,
        { cursor: page.continueCursor, maxBatches: remaining },
      )
    }
    return { processed: page.permits.length, isDone: page.isDone }
  },
})

// Stop an in-flight national backfill chain by cancelling its pending scheduled
// jobs (we can't unset MAPILLARY_TOKEN as a kill switch without losing it).
export const cancelPhotoBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scheduled = await ctx.db.system.query('_scheduled_functions').collect()
    let cancelled = 0
    for (const job of scheduled) {
      if (
        job.name.includes('backfillStationPhotos') &&
        job.state.kind === 'pending'
      ) {
        await ctx.scheduler.cancel(job._id)
        cancelled += 1
      }
    }
    return { cancelled }
  },
})

// Clear all cached photos (and their stored images) so a re-run re-evaluates
// every station with the current matching logic. Self-reschedules in batches.
export const resetStationPhotos = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('stationPhotos')
      .paginate({ cursor: args.cursor ?? null, numItems: 100 })
    for (const row of page.page) {
      if (row.storageId) await ctx.storage.delete(row.storageId)
      await ctx.db.delete(row._id)
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.photos.resetStationPhotos, {
        cursor: page.continueCursor,
      })
    }
    return { deleted: page.page.length, isDone: page.isDone }
  },
})

type MapillaryImage = {
  id: string
  thumb_512_url?: string
  captured_at?: number
  geometry?: { coordinates?: [number, number] }
  computed_geometry?: { coordinates?: [number, number] }
  compass_angle?: number
  computed_compass_angle?: number
}

// Lazily resolve and cache one Mapillary photo for a station. Idempotent and
// safe to call on every detail view: it no-ops when a photo is already cached
// (and only re-checks 'none' results after RECHECK_NONE_AFTER_MS).
export const ensureStationPhoto = action({
  args: { permitNumber: v.string() },
  handler: async (ctx, args): Promise<{ status: 'found' | 'none' | 'skipped' }> => {
    const token = process.env.MAPILLARY_TOKEN
    if (!token) return { status: 'skipped' }

    const context = await ctx.runQuery(internal.photos.photoFetchContext, {
      permitNumber: args.permitNumber,
    })
    if (context.existing) {
      const fresh =
        context.existing.status === 'found' ||
        Date.now() - Date.parse(context.existing.checkedAt) <
          RECHECK_NONE_AFTER_MS
      if (fresh) return { status: 'skipped' }
    }
    const { latitude, longitude } = context
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      await ctx.runMutation(internal.photos.writeStationPhoto, {
        permitNumber: args.permitNumber,
        status: 'none',
      })
      return { status: 'none' }
    }

    const latPad = MAPILLARY_MATCH_METERS / 111_320
    const lonPad =
      MAPILLARY_MATCH_METERS /
      (111_320 * Math.max(Math.cos(toRad(latitude)), 0.01))
    const bbox = [
      longitude - lonPad,
      latitude - latPad,
      longitude + lonPad,
      latitude + latPad,
    ].join(',')

    const url = new URL(MAPILLARY_GRAPH_URL)
    url.searchParams.set('access_token', token)
    url.searchParams.set(
      'fields',
      'id,thumb_512_url,captured_at,geometry,computed_geometry,compass_angle,computed_compass_angle',
    )
    url.searchParams.set('bbox', bbox)
    url.searchParams.set('limit', '50')

    // Pick the closest image whose camera is actually aimed at the station.
    let best: { image: MapillaryImage; distance: number } | null = null
    try {
      const res = await fetch(url)
      if (!res.ok) return { status: 'skipped' }
      const data = (await res.json()) as { data?: MapillaryImage[] }
      for (const image of data.data ?? []) {
        const coords =
          image.computed_geometry?.coordinates ?? image.geometry?.coordinates
        const heading = image.computed_compass_angle ?? image.compass_angle
        if (!coords || !image.thumb_512_url || typeof heading !== 'number') {
          continue
        }
        const distance = distanceMeters(latitude, longitude, coords[1], coords[0])
        if (distance > MAPILLARY_MATCH_METERS) continue
        // Is the camera looking toward the station from where it stands?
        const bearingToStation = bearingDegrees(
          coords[1],
          coords[0],
          latitude,
          longitude,
        )
        if (angleDelta(heading, bearingToStation) > FACING_TOLERANCE_DEG) {
          continue
        }
        if (!best || distance < best.distance) best = { image, distance }
      }
    } catch {
      return { status: 'skipped' }
    }
    const nearest = best

    if (!nearest) {
      await ctx.runMutation(internal.photos.writeStationPhoto, {
        permitNumber: args.permitNumber,
        status: 'none',
      })
      return { status: 'none' }
    }

    try {
      const imageRes = await fetch(nearest.image.thumb_512_url as string)
      if (!imageRes.ok) return { status: 'skipped' }
      const storageId = await ctx.storage.store(await imageRes.blob())
      await ctx.runMutation(internal.photos.writeStationPhoto, {
        permitNumber: args.permitNumber,
        status: 'found',
        storageId,
        mapillaryImageId: nearest.image.id,
        attribution: '© contributors · Mapillary',
        capturedAt: nearest.image.captured_at
          ? new Date(nearest.image.captured_at).toISOString()
          : undefined,
      })
      return { status: 'found' }
    } catch {
      return { status: 'skipped' }
    }
  },
})
