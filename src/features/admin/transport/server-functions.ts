import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getAuth } from '#/lib/auth-server'
import { getDatabase } from '#/db/client'
import { CneHttpSource } from '#/features/ingestion/infrastructure/cne-http-source'
import { PostgresIngestionRepository } from '#/features/ingestion/infrastructure/postgres-ingestion-repository'

const currentAdmin = createServerOnlyFn(async (required = true) => {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  if (!session?.user) {
    if (required) throw new Error('Debes iniciar sesión para ver administración.')
    return null
  }
  const { sql } = getDatabase()
  const [role] = await sql<{ is_admin: boolean }[]>`
    select is_admin from user_roles where user_id = ${session.user.id}
      or email = ${session.user.email.toLowerCase()} limit 1
  `
  if (!role?.is_admin) {
    if (required) throw new Error('No tienes permisos de administrador.')
    return null
  }
  return session.user
})

const runProjection = `
  id as "_id", kind, status, started_at as "startedAt",
  finished_at as "finishedAt", state_external_id as "stateExternalId",
  municipality_external_id as "municipalityExternalId", source_url as "sourceUrl",
  message, records_read as "recordsRead", records_written as "recordsWritten",
  failed_count as "failedCount"
`
type RunRow = {
  _id: string
  kind: string
  status: string
  startedAt: Date
  finishedAt: Date | null
  stateExternalId: string | null
  municipalityExternalId: string | null
  sourceUrl: string | null
  message: string | null
  recordsRead: number | null
  recordsWritten: number | null
  failedCount: number | null
}
const serializeRun = (row: RunRow) => ({
  ...row,
  startedAt: row.startedAt.toISOString(),
  finishedAt: row.finishedAt?.toISOString() ?? undefined,
})

export const getAdminMe = createServerFn({ method: 'GET' }).handler(async () => {
  const admin = await currentAdmin(false)
  return { isAdmin: Boolean(admin), email: admin?.email ?? null }
})

export const getIngestionOverview = createServerFn({ method: 'GET' }).handler(async () => {
  await currentAdmin()
  const { sql } = getDatabase()
  const dailyQueues = (await sql.unsafe<RunRow[]>(`select ${runProjection} from ingestion_runs where kind = 'daily_queue' order by started_at desc limit 5`)).map(serializeRun)
  const recentRuns = (await sql.unsafe<RunRow[]>(`select ${runProjection} from ingestion_runs where kind = 'municipality_prices' order by started_at desc limit 30`)).map(serializeRun)
  const recentFailures = (await sql.unsafe<RunRow[]>(`select ${runProjection} from ingestion_runs where kind = 'municipality_prices' and status = 'failed' order by started_at desc limit 20`)).map(serializeRun)
  const auditEvents = await sql`
    select id as "_id", actor_email as "actorEmail", action, target,
      created_at as "createdAt", status, message, run_id as "runId"
    from admin_audit_events order by created_at desc limit 20
  `
  const latest = dailyQueues[0]
  const processed = latest?.recordsWritten ?? 0
  const failed = latest?.failedCount ?? 0
  return {
    latestDailyQueue: latest ?? null,
    dailyQueues,
    municipalitySummary: {
      ...(processed - failed > 0 ? { success: { count: processed - failed, recordsRead: 0, recordsWritten: 0 } } : {}),
      ...(failed > 0 ? { failed: { count: failed, recordsRead: 0, recordsWritten: 0 } } : {}),
    },
    municipalityTotal: processed,
    municipalityOldestStartedAt: latest?.startedAt ?? null,
    municipalityNewestStartedAt: recentRuns[0]?.startedAt ?? null,
    recentRuns,
    recentFailures,
    auditEvents,
  }
})

export const retryMunicipalityPrices = createServerFn({ method: 'POST' })
  .inputValidator((data: { stateExternalId: string; municipalityExternalId: string }) => data)
  .handler(async ({ data }) => {
    const admin = await currentAdmin()
    if (!admin) throw new Error('No autorizado')
    const { sql } = getDatabase()
    const task = {
      id: crypto.randomUUID(), parentRunId: '',
      stateExternalId: data.stateExternalId,
      municipalityExternalId: data.municipalityExternalId,
    }
    await sql`
      insert into ingestion_runs (id, kind, status, started_at, state_external_id,
        municipality_external_id, heartbeat_at)
      values (${task.id}, 'municipality_prices', 'running', now(),
        ${task.stateExternalId}, ${task.municipalityExternalId}, now())
    `
    const source = new CneHttpSource()
    const repository = new PostgresIngestionRepository()
    try {
      const response = await source.fetchMunicipalityPrices(task.stateExternalId, task.municipalityExternalId)
      const result = await repository.applyMunicipalityPrices(task, response.sourceUrl, response.rows)
      await sql`
        insert into admin_audit_events (id, actor_user_id, actor_email, action,
          target, created_at, status, message, run_id)
        values (${crypto.randomUUID()}, ${admin.id}, ${admin.email},
          'retry_municipality_prices', ${`${task.stateExternalId}:${task.municipalityExternalId}`},
          now(), 'success', ${`recordsWritten=${result.recordsWritten}`}, ${task.id})
      `
      return { runId: task.id, ...result }
    } catch (error) {
      await repository.failTask(task, error instanceof Error ? error.message : 'Retry failed')
      throw error
    }
  })

export const getBrandAuditOverview = createServerFn({ method: 'GET' })
  .inputValidator((data: { stateExternalId?: string; municipalityExternalId?: string }) => data)
  .handler(async ({ data }) => {
    await currentAdmin()
    const { sql } = getDatabase()
    const result = await sql`
      select id as "_id", station_permit_number as "stationPermitNumber",
        station_name as "stationName", station_address as "stationAddress",
        state_name as "stateName", municipality_name as "municipalityName",
        candidate_name as "candidateName", candidate_brand as "candidateBrand",
        candidate_operator as "candidateOperator",
        candidate_distance_meters as "candidateDistanceMeters",
        match_status as "matchStatus", accepted_brand as "acceptedBrand",
        confidence, notes, reviewed_by as "reviewedBy",
        reviewed_at as "reviewedAt", updated_at as "updatedAt"
      from station_brand_audits
      where (${data.stateExternalId ?? null}::text is null or state_external_id = ${data.stateExternalId ?? null})
        and (${data.municipalityExternalId ?? null}::text is null or municipality_external_id = ${data.municipalityExternalId ?? null})
      order by station_name limit 500
    `
    const rows = result.map((row) => ({ ...row }))
    const status = (name: string) => rows.filter((row) => row.matchStatus === name).length
    return { summary: {
      total: rows.length, accepted: status('accepted'),
      review: status('review_nearby_not_accepted'), manual: status('manual_override'),
      rejected: status('rejected'), noMatch: status('no_match'),
    }, rows }
  })

export const reviewStationBrand = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    stationPermitNumber: string
    decision: 'accept_candidate' | 'reject' | 'manual_override'
    acceptedBrand?: string
    notes?: string
  }) => data)
  .handler(async ({ data }) => {
    const admin = await currentAdmin()
    if (!admin) throw new Error('No autorizado')
    const { sql } = getDatabase()
    const [audit] = await sql<{ candidate_brand: string | null; candidate_name: string | null; notes: string | null }[]>`
      select candidate_brand, candidate_name, notes from station_brand_audits
      where station_permit_number = ${data.stationPermitNumber} for update
    `
    if (!audit) throw new Error('No existe auditoría de marca para esta estación.')
    const acceptedBrand = data.decision === 'accept_candidate'
      ? audit.candidate_brand ?? audit.candidate_name : data.acceptedBrand?.trim()
    if (data.decision !== 'reject' && !acceptedBrand) throw new Error('La marca aceptada es requerida.')
    const selectedBrand = acceptedBrand ?? ''
    const matchStatus = data.decision === 'accept_candidate' ? 'accepted'
      : data.decision === 'manual_override' ? 'manual_override' : 'rejected'
    await sql.begin(async (tx) => {
      await tx`
        update station_brand_audits set match_status = ${matchStatus},
          accepted_brand = ${data.decision === 'reject' ? null : selectedBrand},
          confidence = ${data.decision === 'reject' ? 'none' : 'high'},
          notes = ${data.notes?.trim() || audit.notes}, reviewed_by = ${admin.email},
          reviewed_at = now(), updated_at = now()
        where station_permit_number = ${data.stationPermitNumber}
      `
      if (data.decision !== 'reject') {
        await tx`
          insert into station_enrichment (id, station_permit_number, brand,
            display_name, source, enriched_at)
          values (${crypto.randomUUID()}, ${data.stationPermitNumber}, ${selectedBrand},
            ${selectedBrand}, 'manual', now())
          on conflict (station_permit_number) do update set brand = excluded.brand,
            display_name = excluded.display_name, source = 'manual', enriched_at = now()
        `
        await tx`
          update station_listings set enrichment = jsonb_build_object(
            'brand', ${selectedBrand}, 'displayName', ${selectedBrand}, 'source', 'manual'),
            updated_at = now() where permit_number = ${data.stationPermitNumber}
        `
      }
    })
    return { stationPermitNumber: data.stationPermitNumber, matchStatus, acceptedBrand: selectedBrand || undefined }
  })

type AuditStation = {
  permit_number: string
  name: string
  address: string
  state_external_id: string
  municipality_external_id: string
  state_name: string | null
  municipality_name: string | null
  latitude: number
  longitude: number
}
type OsmPoi = { id: string; lat: number; lon: number; tags: Record<string, string> }
type OsmElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat?: number; lon?: number }
  tags?: Record<string, string>
}

const radians = (value: number) => value * Math.PI / 180
const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = radians(lat2 - lat1)
  const dLon = radians(lon2 - lon1)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) *
    Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}
const cleanBrand = (value?: string) => {
  const brand = value?.trim()
  return brand && brand.toLowerCase() !== 'yes' ? brand : null
}

async function fetchFuelPois(stations: AuditStation[]): Promise<OsmPoi[]> {
  const margin = 0.01
  const south = Math.min(...stations.map((row) => row.latitude)) - margin
  const north = Math.max(...stations.map((row) => row.latitude)) + margin
  const west = Math.min(...stations.map((row) => row.longitude)) - margin
  const east = Math.max(...stations.map((row) => row.longitude)) + margin
  const query = `[out:json][timeout:45];(node["amenity"="fuel"](${south},${west},${north},${east});way["amenity"="fuel"](${south},${west},${north},${east});relation["amenity"="fuel"](${south},${west},${north},${east}););out center tags;`
  const response = await fetch(process.env.OVERPASS_URL ?? 'https://overpass.kumi.systems/api/interpreter', {
    method: 'POST',
    signal: AbortSignal.timeout(55_000),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'Litrito brand audit (+https://litrito.com)',
    },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!response.ok) throw new Error(`Overpass falló: ${response.status} ${response.statusText}`)
  const payload = await response.json() as { elements?: OsmElement[] }
  return (payload.elements ?? []).flatMap((element) => {
    const lat = element.lat ?? element.center?.lat
    const lon = element.lon ?? element.center?.lon
    return typeof lat === 'number' && typeof lon === 'number'
      ? [{ id: `${element.type}:${element.id}`, lat, lon, tags: element.tags ?? {} }]
      : []
  })
}

export const scanStationBrands = createServerFn({ method: 'POST' })
  .inputValidator((data: { stateExternalId: string; municipalityExternalId: string }) => data)
  .handler(async ({ data }) => {
    const admin = await currentAdmin()
    if (!admin) throw new Error('No autorizado')
    const { sql } = getDatabase()
    const target = `${data.stateExternalId}:${data.municipalityExternalId}`
    try {
      const stations = await sql<AuditStation[]>`
        select permit_number, name, address, state_external_id,
          municipality_external_id, state_name, municipality_name, latitude, longitude
        from stations where state_external_id = ${data.stateExternalId}
          and municipality_external_id = ${data.municipalityExternalId}
          and latitude is not null and longitude is not null
      `
      if (stations.length === 0) throw new Error('No hay estaciones con coordenadas para auditar.')
      const pois = await fetchFuelPois(stations)
      await sql.begin(async (tx) => {
        for (const station of stations) {
          const nearest = pois.map((poi) => ({
            ...poi,
            distance: distanceMeters(station.latitude, station.longitude, poi.lat, poi.lon),
          })).sort((left, right) => left.distance - right.distance)[0]
          const candidateBrand = cleanBrand(nearest?.tags.brand) ?? cleanBrand(nearest?.tags.name)
          const accepted = Boolean(nearest && nearest.distance <= 40 && candidateBrand)
          const review = Boolean(nearest && !accepted && nearest.distance <= 100)
          const status = accepted ? 'accepted' : review ? 'review_nearby_not_accepted' : 'no_match'
          const [existing] = await tx<{ id: string; match_status: string }[]>`
            select id, match_status from station_brand_audits
            where station_permit_number = ${station.permit_number}
            order by updated_at desc limit 1 for update
          `
          if (existing) {
            const keepDecision = existing.match_status === 'manual_override' || existing.match_status === 'rejected'
            await tx`
              update station_brand_audits set station_name = ${station.name},
                station_address = ${station.address}, station_latitude = ${station.latitude},
                station_longitude = ${station.longitude}, candidate_source = 'osm',
                candidate_id = ${nearest?.id ?? null}, candidate_name = ${nearest?.tags.name ?? null},
                candidate_brand = ${candidateBrand}, candidate_operator = ${nearest?.tags.operator ?? null},
                candidate_latitude = ${nearest?.lat ?? null}, candidate_longitude = ${nearest?.lon ?? null},
                candidate_distance_meters = ${nearest ? Math.round(nearest.distance) : null},
                match_status = ${keepDecision ? existing.match_status : status},
                accepted_brand = case when ${keepDecision} then accepted_brand else ${accepted ? candidateBrand : null} end,
                confidence = ${accepted ? 'high' : review ? 'review' : 'none'},
                scanned_at = now(), updated_at = now()
              where id = ${existing.id}
            `
          } else {
            await tx`
              insert into station_brand_audits (id, station_permit_number, station_name,
                station_address, state_external_id, municipality_external_id, state_name,
                municipality_name, station_latitude, station_longitude, candidate_source,
                candidate_id, candidate_name, candidate_brand, candidate_operator,
                candidate_latitude, candidate_longitude, candidate_distance_meters,
                match_status, accepted_brand, confidence, scanned_at, updated_at)
              values (${crypto.randomUUID()}, ${station.permit_number}, ${station.name},
                ${station.address}, ${station.state_external_id}, ${station.municipality_external_id},
                ${station.state_name}, ${station.municipality_name}, ${station.latitude},
                ${station.longitude}, 'osm', ${nearest?.id ?? null}, ${nearest?.tags.name ?? null},
                ${candidateBrand}, ${nearest?.tags.operator ?? null}, ${nearest?.lat ?? null},
                ${nearest?.lon ?? null}, ${nearest ? Math.round(nearest.distance) : null},
                ${status}, ${accepted ? candidateBrand : null},
                ${accepted ? 'high' : review ? 'review' : 'none'}, now(), now())
            `
          }
          if (accepted && candidateBrand) {
            await tx`
              insert into station_enrichment (id, station_permit_number, brand, display_name, source, enriched_at)
              values (${crypto.randomUUID()}, ${station.permit_number}, ${candidateBrand}, ${candidateBrand}, 'osm', now())
              on conflict (station_permit_number) do update set brand = excluded.brand,
                display_name = excluded.display_name, source = 'osm', enriched_at = now()
            `
            await tx`
              update station_listings set enrichment = jsonb_build_object(
                'brand', ${candidateBrand}, 'displayName', ${candidateBrand}, 'source', 'osm'),
                updated_at = now() where permit_number = ${station.permit_number}
            `
          }
        }
        await tx`
          insert into admin_audit_events (id, actor_user_id, actor_email, action,
            target, created_at, status, message)
          values (${crypto.randomUUID()}, ${admin.id}, ${admin.email}, 'scan_station_brands',
            ${target}, now(), 'success', ${`stations=${stations.length}; osmCandidates=${pois.length}`})
        `
      })
      return { scanned: stations.length, candidates: pois.length }
    } catch (error) {
      await sql`
        insert into admin_audit_events (id, actor_user_id, actor_email, action,
          target, created_at, status, message)
        values (${crypto.randomUUID()}, ${admin.id}, ${admin.email}, 'scan_station_brands',
          ${target}, now(), 'failed', ${error instanceof Error ? error.message : 'Brand scan failed'})
      `
      throw error
    }
  })
