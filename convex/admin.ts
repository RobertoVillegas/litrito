import { v } from 'convex/values'
import {
  action,
  internalMutation,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { components, internal } from './_generated/api'
import { authComponent } from './auth'

declare const process: {
  env: {
    BETTER_AUTH_SECRET?: string
  }
}

type AdminUser = {
  _id: string
  email?: string | null
  isAdmin?: boolean | null
}

type IngestionRun = {
  _id: string
  kind: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  startedAt: string
  finishedAt?: string
  stateExternalId?: string
  municipalityExternalId?: string
  sourceUrl?: string
  message?: string
  recordsRead?: number
  recordsWritten?: number
}

async function requireAdmin(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<AdminUser> {
  const user = (await authComponent.safeGetAuthUser(ctx)) as AdminUser | null

  if (!user) {
    throw new Error('Debes iniciar sesion para ver administracion.')
  }

  if (user.isAdmin !== true) {
    throw new Error('No tienes permisos de administrador.')
  }

  return user
}

function sameOrAfter(iso: string, since: string): boolean {
  return iso >= since
}

function summarizeRuns(runs: IngestionRun[]) {
  const summary: Record<
    string,
    { count: number; recordsRead: number; recordsWritten: number }
  > = {}

  for (const run of runs) {
    summary[run.status] ??= { count: 0, recordsRead: 0, recordsWritten: 0 }
    summary[run.status].count += 1
    summary[run.status].recordsRead += run.recordsRead ?? 0
    summary[run.status].recordsWritten += run.recordsWritten ?? 0
  }

  return summary
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.safeGetAuthUser(ctx)) as AdminUser | null
    return {
      isAdmin: user?.isAdmin === true,
      email: user?.email ?? null,
    }
  },
})

export const ingestionOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)

    const dailyQueues = (await ctx.db
      .query('ingestionRuns')
      .withIndex('by_kind_started', (q) => q.eq('kind', 'daily_queue'))
      .order('desc')
      .take(5)) as IngestionRun[]

    const latestDailyQueue = dailyQueues[0] ?? null
    const municipalityRuns = latestDailyQueue
      ? ((await ctx.db
          .query('ingestionRuns')
          .withIndex('by_kind_started', (q) => q.eq('kind', 'municipality_prices'))
          .order('desc')
          .collect()) as IngestionRun[]).filter((run) =>
          sameOrAfter(run.startedAt, latestDailyQueue.startedAt),
        )
      : []

    const recentRuns = (await ctx.db
      .query('ingestionRuns')
      .withIndex('by_kind_started', (q) => q.eq('kind', 'municipality_prices'))
      .order('desc')
      .take(30)) as IngestionRun[]

    const recentFailures = (await ctx.db
      .query('ingestionRuns')
      .withIndex('by_kind_started', (q) => q.eq('kind', 'municipality_prices'))
      .order('desc')
      .take(500)) as IngestionRun[]

    const auditEvents = await ctx.db
      .query('adminAuditEvents')
      .withIndex('by_created_at')
      .order('desc')
      .take(20)

    return {
      latestDailyQueue,
      dailyQueues,
      municipalitySummary: summarizeRuns(municipalityRuns),
      municipalityTotal: municipalityRuns.length,
      municipalityOldestStartedAt:
        municipalityRuns[municipalityRuns.length - 1]?.startedAt ?? null,
      municipalityNewestStartedAt: municipalityRuns[0]?.startedAt ?? null,
      recentRuns,
      recentFailures: recentFailures.filter((run) => run.status === 'failed').slice(0, 20),
      auditEvents,
    }
  },
})

export const retryMunicipalityPrices = action({
  args: {
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ runId: unknown; recordsWritten: number }> => {
    const admin = await requireAdmin(ctx)
    const target = `${args.stateExternalId}:${args.municipalityExternalId}`

    try {
      const result = (await ctx.runAction(
        internal.ingestion.refreshMunicipalityInternal,
        args,
      )) as { runId: unknown; recordsWritten: number }
      await ctx.runMutation(internal.admin.recordAuditEvent, {
        actorUserId: String(admin._id),
        actorEmail: admin.email ?? undefined,
        action: 'retry_municipality_prices',
        target,
        status: 'success',
        message: `recordsWritten=${result.recordsWritten}`,
        runId: String(result.runId),
      })
      return result
    } catch (error) {
      await ctx.runMutation(internal.admin.recordAuditEvent, {
        actorUserId: String(admin._id),
        actorEmail: admin.email ?? undefined,
        action: 'retry_municipality_prices',
        target,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Retry failed',
      })
      throw error
    }
  },
})

export const setUserAdminByEmail = mutation({
  args: {
    email: v.string(),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    return await setUserAdmin(ctx, {
      actorUserId: String(admin._id),
      actorEmail: admin.email ?? undefined,
      email: args.email,
      isAdmin: args.isAdmin,
    })
  },
})

export const bootstrapAdminByEmail = mutation({
  args: {
    email: v.string(),
    bootstrapSecret: v.string(),
    isAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!process.env.BETTER_AUTH_SECRET || args.bootstrapSecret !== process.env.BETTER_AUTH_SECRET) {
      throw new Error('Bootstrap admin no autorizado.')
    }

    return await setUserAdmin(ctx, {
      actorUserId: 'internal',
      actorEmail: undefined,
      email: args.email,
      isAdmin: args.isAdmin ?? true,
    })
  },
})

export const recordAuditEvent = internalMutation({
  args: {
    actorUserId: v.string(),
    actorEmail: v.optional(v.string()),
    action: v.union(
      v.literal('retry_municipality_prices'),
      v.literal('set_user_admin'),
    ),
    target: v.string(),
    status: v.union(v.literal('success'), v.literal('failed')),
    message: v.optional(v.string()),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('adminAuditEvents', {
      ...args,
      createdAt: new Date().toISOString(),
    })
  },
})

async function setUserAdmin(
  ctx: MutationCtx,
  args: {
    actorUserId: string
    actorEmail?: string
    email: string
    isAdmin: boolean
  },
) {
  const email = args.email.trim().toLowerCase()
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'user',
    where: [{ field: 'email', value: email }],
  })

  if (!user) {
    throw new Error(`No existe usuario con email ${email}.`)
  }

  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: user._id }],
      update: { isAdmin: args.isAdmin },
    },
  } as any)

  await ctx.db.insert('adminAuditEvents', {
    actorUserId: args.actorUserId,
    actorEmail: args.actorEmail,
    action: 'set_user_admin',
    target: email,
    createdAt: new Date().toISOString(),
    status: 'success',
    message: `isAdmin=${args.isAdmin}`,
  })

  return { userId: String(user._id), email, isAdmin: args.isAdmin }
}
