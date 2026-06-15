import type { FunctionArgs } from 'convex/server'
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server'
import { components, internal } from './_generated/api'
import { authComponent } from './auth'

type DeleteManyArgs = FunctionArgs<typeof components.betterAuth.adapter.deleteMany>

// How long a deletion sits in a cancellable state before the cron purges it.
export const GRACE_PERIOD_DAYS = 15
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000

async function requireUser(ctx: MutationCtx) {
  const user = await authComponent.safeGetAuthUser(ctx)
  if (!user) {
    throw new Error('Debes iniciar sesión.')
  }
  return user
}

// Banner data for the profile page: the pending deletion for the current user,
// or null. Returns null (not an error) when signed out so it stays safe during
// the sign-out transition.
export const myDeletion = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) return null
    const row = await ctx.db
      .query('accountDeletions')
      .withIndex('by_user', (q) => q.eq('authUserId', String(user._id)))
      .unique()
    return row ? { scheduledAt: row.scheduledAt } : null
  },
})

export const request = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const authUserId = String(user._id)
    const existing = await ctx.db
      .query('accountDeletions')
      .withIndex('by_user', (q) => q.eq('authUserId', authUserId))
      .unique()
    if (existing) {
      return { scheduledAt: existing.scheduledAt }
    }

    const scheduledAt = Date.now() + GRACE_PERIOD_MS
    await ctx.db.insert('accountDeletions', {
      authUserId,
      email: user.email,
      name: user.name ?? undefined,
      requestedAt: new Date().toISOString(),
      scheduledAt,
    })
    await ctx.scheduler.runAfter(0, internal.email.sendAccountDeletionEmail.send, {
      mode: 'scheduled',
      userEmail: user.email,
      userName: user.name ?? undefined,
      scheduledAt,
    })
    return { scheduledAt }
  },
})

export const cancel = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const row = await ctx.db
      .query('accountDeletions')
      .withIndex('by_user', (q) => q.eq('authUserId', String(user._id)))
      .unique()
    if (row) {
      await ctx.db.delete(row._id)
    }
    return { cancelled: Boolean(row) }
  },
})

// Daily cron: purge every deletion whose grace period has elapsed.
export const purgeDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const due = await ctx.db
      .query('accountDeletions')
      .withIndex('by_scheduled', (q) => q.lte('scheduledAt', now))
      .take(50)

    for (const row of due) {
      await deleteAppData(ctx, row.authUserId)
      await deleteAuthUser(ctx, row.authUserId, row.email)
      await ctx.db.delete(row._id)
      await ctx.scheduler.runAfter(0, internal.email.sendAccountDeletionEmail.send, {
        mode: 'completed',
        userEmail: row.email,
        userName: row.name,
      })
    }

    return { purged: due.length }
  },
})

// Deletes data owned by this app (not Better Auth's tables).
async function deleteAppData(ctx: MutationCtx, userId: string) {
  const favorites = await ctx.db
    .query('stationFavorites')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
  for (const fav of favorites) {
    await ctx.db.delete(fav._id)
  }

  const roles = await ctx.db
    .query('userRoles')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .collect()
  for (const role of roles) {
    await ctx.db.delete(role._id)
  }
}

// Deletes the user's Better Auth records (sessions, accounts, verification
// tokens, then the user row) through the component's adapter mutations.
async function deleteAuthUser(ctx: MutationCtx, authUserId: string, email: string) {
  await deleteAuthRows(ctx, 'session', 'userId', authUserId)
  await deleteAuthRows(ctx, 'account', 'userId', authUserId)
  // verification rows are keyed by identifier (e.g. the email or a prefixed
  // token), not userId — match anything containing the email.
  await deleteAuthRows(ctx, 'verification', 'identifier', email, 'contains')
  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: authUserId }],
    },
  })
}

async function deleteAuthRows(
  ctx: MutationCtx,
  model: 'session' | 'account' | 'verification',
  field: string,
  value: string,
  operator?: 'eq' | 'contains',
) {
  let cursor: string | null = null
  for (;;) {
    // The adapter's `where.field` is a per-model discriminated union; with a
    // generic `model`/`field` we assert the concrete (runtime-valid) shape.
    const args = {
      input: {
        model,
        where: [{ field, value, ...(operator ? { operator } : {}) }],
      },
      paginationOpts: { numItems: 200, cursor },
    } as DeleteManyArgs
    const result: { isDone: boolean; continueCursor: string } =
      await ctx.runMutation(components.betterAuth.adapter.deleteMany, args)
    if (result.isDone) break
    cursor = result.continueCursor
  }
}
