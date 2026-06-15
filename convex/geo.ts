import { GeospatialIndex } from '@convex-dev/geospatial'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'

// S2-backed geospatial index of every station, keyed by permitNumber. Replaces
// the latitude-band scan that could silently drop a user's nearest stations in
// dense areas: S2 prunes on both lat AND lon, so `nearest` returns the true
// closest points without a directional cap.
export const stationGeoIndex = new GeospatialIndex(components.geospatial)

function hasValidCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    // (0,0) is the "null island" sentinel that bad geocoding leaves behind.
    !(latitude === 0 && longitude === 0)
  )
}

// Keep the index in sync when a station gains/updates coordinates. Called from
// the ingestion mutations that write latitude/longitude. Insert upserts by key.
// Returns false (and skips) for invalid coordinates so a single bad record can
// never abort the calling mutation. Safe to await from ingestion.
export async function indexStationLocation(
  ctx: MutationCtx,
  permitNumber: string,
  latitude: number,
  longitude: number,
): Promise<boolean> {
  if (!hasValidCoordinates(latitude, longitude)) return false
  await stationGeoIndex.insert(ctx, permitNumber, { latitude, longitude }, {})
  return true
}

// Each S2 insert fans out into several index writes, so a large batch trips the
// self-hosted "too many system operations" ceiling. 50 stays comfortably under
// it while keeping the backfill to a reasonable number of chained mutations.
const BACKFILL_BATCH = 50

// One-time (and idempotent) backfill: walks the stations table and inserts each
// station with coordinates into the geo index, self-rescheduling until done so
// it never trips the single-paginate-per-function rule or per-call read limits.
// Kick off with: `bunx convex run geo:backfillStationGeo '{}'`.
export const backfillStationGeo = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('stations')
      .paginate({ cursor: args.cursor ?? null, numItems: BACKFILL_BATCH })

    let inserted = 0
    let skipped = 0
    for (const station of page.page) {
      if (
        typeof station.latitude === 'number' &&
        typeof station.longitude === 'number'
      ) {
        const ok = await indexStationLocation(
          ctx,
          station.permitNumber,
          station.latitude,
          station.longitude,
        )
        if (ok) inserted += 1
        else skipped += 1
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.geo.backfillStationGeo, {
        cursor: page.continueCursor,
      })
    }

    return { inserted, skipped, isDone: page.isDone }
  },
})
