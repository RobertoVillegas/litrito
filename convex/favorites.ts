import { v } from 'convex/values'
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { authComponent } from './auth'

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await authComponent.safeGetAuthUser(ctx)

  if (!user) {
    throw new Error('Debes iniciar sesion para usar favoritos.')
  }

  return user
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const userId = String(user._id)
    const favorites = await ctx.db
      .query('stationFavorites')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()

    return favorites.map((favorite) => favorite.stationPermitNumber)
  },
})

export const toggle = mutation({
  args: { stationPermitNumber: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const userId = String(user._id)
    const existing = await ctx.db
      .query('stationFavorites')
      .withIndex('by_user_station', (q) =>
        q
          .eq('userId', userId)
          .eq('stationPermitNumber', args.stationPermitNumber),
      )
      .unique()

    if (existing) {
      await ctx.db.delete(existing._id)
      return { favorited: false }
    }

    await ctx.db.insert('stationFavorites', {
      userId,
      stationPermitNumber: args.stationPermitNumber,
      createdAt: new Date().toISOString(),
    })

    return { favorited: true }
  },
})
