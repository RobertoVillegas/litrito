import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

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
