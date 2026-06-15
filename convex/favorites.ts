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
    // Return empty (not an error) when signed out: this query stays subscribed
    // for a tick during sign-out / account deletion, and throwing here bubbles
    // to the route error boundary. Mutations below still require a user.
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) return []
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

export const set = mutation({
  args: {
    stationPermitNumber: v.string(),
    favorited: v.boolean(),
  },
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

    if (args.favorited) {
      if (!existing) {
        await ctx.db.insert('stationFavorites', {
          userId,
          stationPermitNumber: args.stationPermitNumber,
          createdAt: new Date().toISOString(),
        })
      }

      return { favorited: true }
    }

    if (existing) {
      await ctx.db.delete(existing._id)
    }

    return { favorited: false }
  },
})
