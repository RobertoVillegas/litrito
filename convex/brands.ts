import { v } from 'convex/values'
import { internalQuery } from './_generated/server'
import { brandFromLegalName } from './brandRules'

// One-off measurement: how many stations get a confident brand from the free
// legal-name rules alone? Tells us the size of the paid (Google) tail before we
// spend anything. Reads only what take() returns; run with a high limit to
// cover the whole catalog.
export const measureBrandCoverage = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const stations = await ctx.db.query('stations').take(args.limit ?? 14000)
    const byBrand: Record<string, number> = {}
    let withBrand = 0
    for (const station of stations) {
      const brand = brandFromLegalName(station.name)
      if (brand) {
        withBrand += 1
        byBrand[brand] = (byBrand[brand] ?? 0) + 1
      }
    }
    const sorted = Object.fromEntries(
      Object.entries(byBrand).sort((a, b) => b[1] - a[1]),
    )
    return {
      sampled: stations.length,
      withBrand,
      withoutBrand: stations.length - withBrand,
      pct: Math.round((withBrand / Math.max(stations.length, 1)) * 1000) / 10,
      byBrand: sorted,
    }
  },
})
