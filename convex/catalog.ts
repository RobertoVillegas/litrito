import { query } from './_generated/server'
import { v } from 'convex/values'

export const states = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('states').collect()
  },
})

export const municipalities = query({
  args: { stateExternalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('municipalities')
      .withIndex('by_state', (q) => q.eq('stateExternalId', args.stateExternalId))
      .collect()
  },
})
