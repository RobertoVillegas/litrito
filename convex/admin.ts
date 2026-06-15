import { v } from 'convex/values'
import {
  action,
  internalQuery,
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

type StationForBrandAudit = {
  permitNumber: string
  name: string
  address: string
  stateExternalId: string
  municipalityExternalId: string
  stateName?: string
  municipalityName?: string
  latitude?: number
  longitude?: number
}

type OsmElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat?: number; lon?: number }
  tags?: Record<string, string>
}

const BRAND_AUTO_ACCEPT_METERS = 40
const BRAND_REVIEW_METERS = 100
const OVERPASS_URL = 'https://overpass.kumi.systems/api/interpreter'

async function requireAdmin(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<AdminUser> {
  const user = (await authComponent.safeGetAuthUser(ctx)) as AdminUser | null

  if (!user) {
    throw new Error('Debes iniciar sesion para ver administracion.')
  }

  const role = await getRoleForCtx(ctx, String(user._id), user.email)

  if (role?.isAdmin !== true) {
    throw new Error('No tienes permisos de administrador.')
  }

  return user
}

async function getRoleForCtx(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  userId: string,
  email?: string | null,
) {
  if ('db' in ctx) {
    return await getRoleByUser(ctx, userId, email)
  }

  return await ctx.runQuery(internal.admin.getRoleByUserInternal, {
    userId,
    email: email ?? undefined,
  })
}

async function getRoleByUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  email?: string | null,
) {
  const roleByUserId = await ctx.db
    .query('userRoles')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .unique()

  if (roleByUserId || !email) {
    return roleByUserId
  }

  return await ctx.db
    .query('userRoles')
    .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
    .unique()
}

export const getRoleByUserInternal = internalQuery({
  args: {
    userId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await getRoleByUser(ctx, args.userId, args.email)
  },
})

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
    const role = user ? await getRoleByUser(ctx, String(user._id), user.email) : null

    return {
      isAdmin: role?.isAdmin === true,
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

export const stationBrandAuditOverview = query({
  args: {
    stateExternalId: v.optional(v.string()),
    municipalityExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)

    let rows =
      args.stateExternalId && args.municipalityExternalId
        ? await ctx.db
            .query('stationBrandAudits')
            .withIndex('by_location', (q) =>
              q
                .eq('stateExternalId', args.stateExternalId as string)
                .eq('municipalityExternalId', args.municipalityExternalId as string),
            )
            .collect()
        : await ctx.db.query('stationBrandAudits').withIndex('by_updated_at').order('desc').take(100)

    rows = rows.sort((a, b) => a.stationName.localeCompare(b.stationName))

    const summary = {
      total: rows.length,
      accepted: rows.filter((r) => r.matchStatus === 'accepted').length,
      review: rows.filter((r) => r.matchStatus === 'review_nearby_not_accepted').length,
      manual: rows.filter((r) => r.matchStatus === 'manual_override').length,
      rejected: rows.filter((r) => r.matchStatus === 'rejected').length,
      noMatch: rows.filter((r) => r.matchStatus === 'no_match').length,
    }

    return { summary, rows }
  },
})

export const scanStationBrands = action({
  args: {
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
  },
  handler: async (ctx, args): Promise<{ scanned: number; candidates: number }> => {
    const admin = await requireAdmin(ctx)
    const target = `${args.stateExternalId}:${args.municipalityExternalId}`

    try {
      const stations = (await ctx.runQuery(internal.admin.listStationsForBrandAudit, args)) as
        StationForBrandAudit[]
      const geocoded = stations.filter(
        (s) => typeof s.latitude === 'number' && typeof s.longitude === 'number',
      )

      if (geocoded.length === 0) {
        throw new Error('No hay estaciones con coordenadas para auditar.')
      }

      const pois = await fetchOsmFuelPois(geocoded)
      await ctx.runMutation(internal.admin.writeStationBrandAuditBatch, {
        rows: geocoded.map((station) => buildBrandAuditRow(station, pois)),
      })
      await ctx.runMutation(internal.admin.recordAuditEvent, {
        actorUserId: String(admin._id),
        actorEmail: admin.email ?? undefined,
        action: 'scan_station_brands',
        target,
        status: 'success',
        message: `stations=${geocoded.length}; osmCandidates=${pois.length}`,
      })

      return { scanned: geocoded.length, candidates: pois.length }
    } catch (error) {
      await ctx.runMutation(internal.admin.recordAuditEvent, {
        actorUserId: String(admin._id),
        actorEmail: admin.email ?? undefined,
        action: 'scan_station_brands',
        target,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Brand scan failed',
      })
      throw error
    }
  },
})

export const reviewStationBrand = mutation({
  args: {
    stationPermitNumber: v.string(),
    decision: v.union(
      v.literal('accept_candidate'),
      v.literal('reject'),
      v.literal('manual_override'),
    ),
    acceptedBrand: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    const audit = await ctx.db
      .query('stationBrandAudits')
      .withIndex('by_station', (q) => q.eq('stationPermitNumber', args.stationPermitNumber))
      .unique()

    if (!audit) {
      throw new Error('No existe auditoria de marca para esta estacion.')
    }

    const now = new Date().toISOString()
    const acceptedBrand =
      args.decision === 'accept_candidate'
        ? audit.candidateBrand || audit.candidateName
        : args.acceptedBrand?.trim()

    if (args.decision !== 'reject' && !acceptedBrand) {
      throw new Error('La marca aceptada es requerida.')
    }

    const matchStatus =
      args.decision === 'accept_candidate'
        ? 'accepted'
        : args.decision === 'manual_override'
          ? 'manual_override'
          : 'rejected'

    await ctx.db.patch(audit._id, {
      matchStatus,
      acceptedBrand: args.decision === 'reject' ? undefined : acceptedBrand,
      confidence: args.decision === 'reject' ? 'none' : 'high',
      notes: args.notes?.trim() || audit.notes,
      reviewedBy: admin.email ?? String(admin._id),
      reviewedAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('adminAuditEvents', {
      actorUserId: String(admin._id),
      actorEmail: admin.email ?? undefined,
      action: 'review_station_brand',
      target: args.stationPermitNumber,
      createdAt: now,
      status: 'success',
      message: `${matchStatus}${acceptedBrand ? `:${acceptedBrand}` : ''}`,
    })

    return { stationPermitNumber: args.stationPermitNumber, matchStatus, acceptedBrand }
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
      v.literal('scan_station_brands'),
      v.literal('review_station_brand'),
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

export const listStationsForBrandAudit = internalQuery({
  args: {
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('stations')
      .withIndex('by_location', (q) =>
        q
          .eq('stateExternalId', args.stateExternalId)
          .eq('municipalityExternalId', args.municipalityExternalId),
      )
      .collect()
  },
})

export const writeStationBrandAuditBatch = internalMutation({
  args: {
    rows: v.array(
      v.object({
        stationPermitNumber: v.string(),
        stationName: v.string(),
        stationAddress: v.string(),
        stateExternalId: v.string(),
        municipalityExternalId: v.string(),
        stateName: v.optional(v.string()),
        municipalityName: v.optional(v.string()),
        stationLatitude: v.optional(v.number()),
        stationLongitude: v.optional(v.number()),
        candidateSource: v.union(v.literal('osm'), v.literal('google_places'), v.literal('manual')),
        candidateId: v.optional(v.string()),
        candidateName: v.optional(v.string()),
        candidateBrand: v.optional(v.string()),
        candidateOperator: v.optional(v.string()),
        candidateLatitude: v.optional(v.number()),
        candidateLongitude: v.optional(v.number()),
        candidateDistanceMeters: v.optional(v.number()),
        matchStatus: v.union(
          v.literal('accepted'),
          v.literal('review_nearby_not_accepted'),
          v.literal('no_match'),
          v.literal('manual_override'),
          v.literal('rejected'),
        ),
        acceptedBrand: v.optional(v.string()),
        confidence: v.union(v.literal('high'), v.literal('review'), v.literal('none')),
        notes: v.optional(v.string()),
        scannedAt: v.string(),
        updatedAt: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('stationBrandAudits')
        .withIndex('by_station', (q) => q.eq('stationPermitNumber', row.stationPermitNumber))
        .unique()

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...row,
          reviewedBy: existing.reviewedBy,
          reviewedAt: existing.reviewedAt,
          acceptedBrand:
            existing.matchStatus === 'manual_override' || existing.matchStatus === 'rejected'
              ? existing.acceptedBrand
              : row.acceptedBrand,
          matchStatus:
            existing.matchStatus === 'manual_override' || existing.matchStatus === 'rejected'
              ? existing.matchStatus
              : row.matchStatus,
          notes: existing.notes ?? row.notes,
        })
      } else {
        await ctx.db.insert('stationBrandAudits', row)
      }
    }
  },
})

async function fetchOsmFuelPois(stations: StationForBrandAudit[]) {
  const lats = stations.map((s) => s.latitude).filter((v): v is number => typeof v === 'number')
  const lons = stations.map((s) => s.longitude).filter((v): v is number => typeof v === 'number')
  const margin = 0.01
  const south = Math.min(...lats) - margin
  const north = Math.max(...lats) + margin
  const west = Math.min(...lons) - margin
  const east = Math.max(...lons) + margin
  const query = `[out:json][timeout:45];(node["amenity"="fuel"](${south},${west},${north},${east});way["amenity"="fuel"](${south},${west},${north},${east});relation["amenity"="fuel"](${south},${west},${north},${east}););out center tags;`

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'Litrito brand audit (+https://litrito.mx)',
    },
    body: `data=${encodeURIComponent(query)}`,
  })

  if (!response.ok) {
    throw new Error(`Overpass fallo: ${response.status} ${response.statusText}`)
  }

  const body = (await response.json()) as { elements?: OsmElement[] }
  return (body.elements ?? [])
    .map((element) => ({
      id: `${element.type}:${element.id}`,
      lat: element.lat ?? element.center?.lat,
      lon: element.lon ?? element.center?.lon,
      tags: element.tags ?? {},
    }))
    .filter((poi): poi is { id: string; lat: number; lon: number; tags: Record<string, string> } =>
      typeof poi.lat === 'number' && typeof poi.lon === 'number',
    )
}

function buildBrandAuditRow(
  station: StationForBrandAudit,
  pois: Array<{ id: string; lat: number; lon: number; tags: Record<string, string> }>,
) {
  const now = new Date().toISOString()
  const nearest =
    typeof station.latitude === 'number' && typeof station.longitude === 'number'
      ? pois
          .map((poi) => ({
            ...poi,
            distanceMeters: distanceMeters(
              station.latitude as number,
              station.longitude as number,
              poi.lat,
              poi.lon,
            ),
          }))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)[0]
      : undefined
  const distance = nearest ? Math.round(nearest.distanceMeters) : undefined
  const accepted = nearest != null && nearest.distanceMeters <= BRAND_AUTO_ACCEPT_METERS
  const review =
    nearest != null &&
    nearest.distanceMeters > BRAND_AUTO_ACCEPT_METERS &&
    nearest.distanceMeters <= BRAND_REVIEW_METERS
  const candidateBrand = cleanBrand(nearest?.tags.brand) ?? cleanBrand(nearest?.tags.name)

  return {
    stationPermitNumber: station.permitNumber,
    stationName: station.name,
    stationAddress: station.address,
    stateExternalId: station.stateExternalId,
    municipalityExternalId: station.municipalityExternalId,
    stateName: station.stateName,
    municipalityName: station.municipalityName,
    stationLatitude: station.latitude,
    stationLongitude: station.longitude,
    candidateSource: 'osm' as const,
    candidateId: nearest?.id,
    candidateName: nearest?.tags.name,
    candidateBrand,
    candidateOperator: nearest?.tags.operator,
    candidateLatitude: nearest?.lat,
    candidateLongitude: nearest?.lon,
    candidateDistanceMeters: distance,
    matchStatus: accepted
      ? ('accepted' as const)
      : review
        ? ('review_nearby_not_accepted' as const)
        : ('no_match' as const),
    acceptedBrand: accepted ? candidateBrand : undefined,
    confidence: accepted ? ('high' as const) : review ? ('review' as const) : ('none' as const),
    notes: review
      ? 'POI cercano no aceptado automaticamente; revisar falso positivo en zonas densas.'
      : undefined,
    scannedAt: now,
    updatedAt: now,
  }
}

function cleanBrand(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (trimmed.toLowerCase() === 'yes') return undefined
  return trimmed
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusMeters = 6_371_000
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const rLat1 = toRad(lat1)
  const rLat2 = toRad(lat2)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2
  return 2 * radiusMeters * Math.asin(Math.sqrt(h))
}

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

  const existingRole = await ctx.db
    .query('userRoles')
    .withIndex('by_user_id', (q) => q.eq('userId', String(user._id)))
    .unique()
  const now = new Date().toISOString()

  if (existingRole) {
    await ctx.db.patch(existingRole._id, {
      email,
      isAdmin: args.isAdmin,
      updatedAt: now,
    })
  } else {
    await ctx.db.insert('userRoles', {
      userId: String(user._id),
      email,
      isAdmin: args.isAdmin,
      createdAt: now,
      updatedAt: now,
    })
  }

  await ctx.db.insert('adminAuditEvents', {
    actorUserId: args.actorUserId,
    actorEmail: args.actorEmail,
    action: 'set_user_admin',
    target: email,
    createdAt: now,
    status: 'success',
    message: `isAdmin=${args.isAdmin}`,
  })

  return { userId: String(user._id), email, isAdmin: args.isAdmin }
}
