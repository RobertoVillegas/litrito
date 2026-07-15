import { v } from 'convex/values'
import { query } from './_generated/server'

export const latestRun = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query('ingestionRuns')
      .withIndex('by_kind_started', (q) => q.eq('kind', 'municipality_prices'))
      .order('desc')
      .take(1)

    return runs[0] ?? null
  },
})

export const stationHistory = query({
  args: { permitNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('fuelPricesHistory')
      .withIndex('by_station', (q) =>
        q.eq('stationPermitNumber', args.permitNumber),
      )
      .order('desc')
      .take(120)
  },
})
