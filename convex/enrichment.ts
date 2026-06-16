import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import type { QueryCtx } from './_generated/server'

export type StationEnrichment = {
  brand: string | null
  displayName: string | null
  source: string
}

// Look up external enrichment (brand / display name) for a set of stations.
// Read-only and never touches the CNE station record. Chunked to stay under the
// parallel-read ceiling; callers pass only the rows they actually return.
export async function loadEnrichment(
  ctx: QueryCtx,
  permitNumbers: string[],
): Promise<Map<string, StationEnrichment>> {
  const map = new Map<string, StationEnrichment>()
  const CHUNK = 16
  for (let i = 0; i < permitNumbers.length; i += CHUNK) {
    const batch = permitNumbers.slice(i, i + CHUNK)
    const rows = await Promise.all(
      batch.map((permitNumber) =>
        ctx.db
          .query('stationEnrichment')
          .withIndex('by_station', (q) =>
            q.eq('stationPermitNumber', permitNumber),
          )
          .unique(),
      ),
    )
    for (const row of rows) {
      if (!row) continue
      map.set(row.stationPermitNumber, {
        brand: row.brand ?? null,
        displayName: row.displayName ?? null,
        source: row.source,
      })
    }
  }
  return map
}

const enrichmentSource = v.union(
  v.literal('overture'),
  v.literal('foursquare'),
  v.literal('osm'),
  v.literal('legal_name'),
  v.literal('manual'),
)

// Bulk-apply external brand/name enrichment, keyed by CNE permit number. Never
// touches the stations table — writes only into stationEnrichment, recording
// the source for traceability. Idempotent: re-applying replaces the row for a
// station. Driven in batches from a local match script.
export const applyEnrichmentBatch = internalMutation({
  args: {
    source: enrichmentSource,
    sourceRelease: v.optional(v.string()),
    rows: v.array(
      v.object({
        permitNumber: v.string(),
        brand: v.optional(v.string()),
        displayName: v.optional(v.string()),
        sourceId: v.optional(v.string()),
        sourceName: v.optional(v.string()),
        matchDistanceMeters: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString()
    let written = 0
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('stationEnrichment')
        .withIndex('by_station', (q) =>
          q.eq('stationPermitNumber', row.permitNumber),
        )
        .unique()
      const value = {
        stationPermitNumber: row.permitNumber,
        brand: row.brand,
        displayName: row.displayName,
        source: args.source,
        sourceRelease: args.sourceRelease,
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        matchDistanceMeters: row.matchDistanceMeters,
        enrichedAt: now,
      }
      if (existing) await ctx.db.patch(existing._id, value)
      else await ctx.db.insert('stationEnrichment', value)
      written += 1
    }
    return { written }
  },
})
