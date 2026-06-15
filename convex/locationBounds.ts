import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const boundArgs = {
  stateExternalId: v.string(),
  municipalityExternalId: v.optional(v.string()),
  swLat: v.number(),
  swLon: v.number(),
  neLat: v.number(),
  neLon: v.number(),
  source: v.string(),
}

function locationKey(stateExternalId: string, municipalityExternalId?: string) {
  return municipalityExternalId
    ? `${stateExternalId}|${municipalityExternalId}`
    : stateExternalId
}

export const list = query({
  args: {
    stateExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.stateExternalId) {
      return await ctx.db
        .query('locationBounds')
        .withIndex('by_state', (q) => q.eq('stateExternalId', args.stateExternalId!))
        .collect()
    }
    return await ctx.db.query('locationBounds').collect()
  },
})

export const upsertMany = mutation({
  args: {
    bounds: v.array(v.object(boundArgs)),
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString()
    let written = 0
    for (const row of args.bounds) {
      const key = locationKey(row.stateExternalId, row.municipalityExternalId)
      const value = {
        ...row,
        key,
        updatedAt,
      }
      const existing = await ctx.db
        .query('locationBounds')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, value)
      } else {
        await ctx.db.insert('locationBounds', value)
      }
      written += 1
    }
    return { written }
  },
})
