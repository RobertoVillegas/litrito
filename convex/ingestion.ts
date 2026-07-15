import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { latBucketFor } from './geocells'
import {
  upsertStationListing,
  type ListingPrices,
} from './listings'
import {
  municipalityId,
  normalizeFuelType,
  normalizeText,
  stateId,
  type FuelType,
} from './normalization'
import { fuelTypeValidator, runStatusValidator } from './validators'

const CNE_CATALOG_URL = 'https://api-catalogo.cne.gob.mx/api/utiles'
const CNE_REPORT_URL = 'https://api-reportediario.cne.gob.mx/api/EstacionServicio/Petroliferos'
const CNE_XML_URL = 'https://publicacionexterna.azurewebsites.net/publicaciones/prices'
const CNE_PLACES_URL = 'https://publicacionexterna.azurewebsites.net/publicaciones/places'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_MIN_INTERVAL_MS = 1100
const GEOCODE_BATCH_SIZE = 40
const COORDINATE_BOUNDS_MARGIN_DEGREES = 0.05

// Process exactly one municipality per worker invocation. Keeping 25 fetch and
// mutation results alive in one action still caused memory carry-over restarts.
const MUNICIPALITY_REFRESH_PAGE_SIZE = 1
const MUNICIPALITY_PAGE_PAUSE_MS = 2_000
const ACTIVE_DAILY_QUEUE_TIMEOUT_MS = 6 * 60 * 60 * 1000

type CneState = {
  EntidadFederativaId: string | number
  Nombre: string
}

type CneMunicipality = {
  MunicipioId: string | number
  EntidadFederativaId: string | number
  Nombre: string
  EntidadFederativa?: { EntidadFederativaId: string | number; Nombre: string }
}

type CnePrice = {
  Numero: string
  Direccion: string
  Producto: string
  SubProducto: string
  PrecioVigente: number
  EntidadFederativaId: string | number
  MunicipioId: string | number
  Nombre: string
}

type MunicipalityPrice = {
  permitNumber: string
  name: string
  address: string
  product: string
  subproduct: string
  fuelType: FuelType
  price: number
  stateExternalId: string
  municipalityExternalId: string
}

type CnePlace = {
  placeId: string
  permitNumber: string
  name: string
  latitude: number
  longitude: number
}

type MunicipalityRefreshResult = {
  runId: unknown
  recordsWritten: number
  newStations: number
}

type SnapshotResult = {
  runId: unknown
}

type CoordinateBounds = {
  swLat: number
  swLon: number
  neLat: number
  neLon: number
}

function coordinateWithinBounds(
  latitude: number,
  longitude: number,
  bounds: CoordinateBounds | null,
): boolean {
  if (!bounds) return true
  return (
    latitude >= bounds.swLat - COORDINATE_BOUNDS_MARGIN_DEGREES &&
    latitude <= bounds.neLat + COORDINATE_BOUNDS_MARGIN_DEGREES &&
    longitude >= bounds.swLon - COORDINATE_BOUNDS_MARGIN_DEGREES &&
    longitude <= bounds.neLon + COORDINATE_BOUNDS_MARGIN_DEGREES
  )
}

type PlacesSnapshotResult = {
  runId: unknown
  places: number
}

type QueueDailyRefreshResult = {
  queuedMunicipalities: number
  skipped?: boolean
  message?: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Litrito/1.0 (+https://litrito.mx)',
    },
  })

  if (!response.ok) {
    throw new Error(`CNE request failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

type CneEnvelope<T> = { Success: boolean; Errors: unknown; Value: T }

function isCneEnvelope<T>(body: unknown): body is CneEnvelope<T> {
  return typeof body === 'object' && body !== null && 'Success' in body && 'Value' in body
}

function unwrapEnvelope<T>(body: unknown, context: string): T {
  if (Array.isArray(body)) {
    return body as T
  }
  if (isCneEnvelope<T>(body)) {
    if (!body.Success) {
      throw new Error(`CNE reportó error (${context}): ${String(body.Errors ?? 'desconocido')}`)
    }
    return body.Value
  }
  throw new Error(`CNE envelope inválido (${context})`)
}

async function fetchCatalog() {
  const statesBody = await fetchJson<unknown>(
    `${CNE_CATALOG_URL}/entidadesfederativas`,
  )
  const states = unwrapEnvelope<CneState[]>(statesBody, 'entidadesfederativas')
  const municipalities: CneMunicipality[] = []

  for (const state of states) {
    const stateExternalId = stateId(state.EntidadFederativaId)
    const stateMunicipalitiesBody = await fetchJson<unknown>(
      `${CNE_CATALOG_URL}/municipios?EntidadFederativaId=${stateExternalId}`,
    )
    const stateMunicipalities = unwrapEnvelope<CneMunicipality[]>(
      stateMunicipalitiesBody,
      `municipios?EntidadFederativaId=${stateExternalId}`,
    )
    for (const { EntidadFederativa: _ignored, ...municipality } of stateMunicipalities) {
      municipalities.push(municipality)
    }
  }

  return { states, municipalities }
}

function normalizePriceRows(
  rows: CnePrice[],
  expected: { stateExternalId: string; municipalityExternalId: string },
): { rows: MunicipalityPrice[]; mismatches: number } {
  const seen = new Set<string>()
  const validRows: MunicipalityPrice[] = []
  let mismatches = 0

  for (const row of rows) {
    const price = Number(row.PrecioVigente)
    const permitNumber = normalizeText(row.Numero)
    const product = normalizeText(row.Producto)
    const subproduct = normalizeText(row.SubProducto)
    const stateExternalId = stateId(row.EntidadFederativaId)
    const municipalityExternalId = municipalityId(row.MunicipioId)
    const fuel = normalizeFuelType(product, subproduct)
    const duplicateKey = `${permitNumber}:${fuel}`

    if (
      stateExternalId !== expected.stateExternalId ||
      municipalityExternalId !== expected.municipalityExternalId
    ) {
      mismatches += 1
      continue
    }

    if (!permitNumber || !Number.isFinite(price) || price <= 0 || seen.has(duplicateKey)) {
      continue
    }

    seen.add(duplicateKey)
    validRows.push({
      permitNumber,
      name: normalizeText(row.Nombre) || 'Estacion sin nombre',
      address: normalizeText(row.Direccion) || 'Direccion no disponible',
      product,
      subproduct,
      fuelType: fuel,
      price,
      stateExternalId,
      municipalityExternalId,
    })
  }

  return { rows: validRows, mismatches }
}

function parsePlaceRows(xml: string, permitFilter?: Set<string>): CnePlace[] {
  const places: CnePlace[] = []
  const placeMatches = xml.matchAll(/<place\s+place_id="([^"]+)">([\s\S]*?)<\/place>/g)

  for (const match of placeMatches) {
    const body = match[2] ?? ''
    const permitNumber = normalizeText(body.match(/<cre_id>([\s\S]*?)<\/cre_id>/)?.[1])
    const name = normalizeText(body.match(/<name>([\s\S]*?)<\/name>/)?.[1])
    const locationBlock = body.match(/<location>([\s\S]*?)<\/location>/)?.[1] ?? body
    const longitude = Number(locationBlock.match(/<x>([\s\S]*?)<\/x>/)?.[1])
    const latitude = Number(locationBlock.match(/<y>([\s\S]*?)<\/y>/)?.[1])

    if (!permitNumber || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue
    }
    if (permitFilter && !permitFilter.has(permitNumber)) continue

    places.push({
      placeId: match[1] ?? '',
      permitNumber,
      name,
      latitude,
      longitude,
    })
  }

  return places
}

export const applyCatalog = internalMutation({
  args: {
    states: v.array(
      v.object({
        EntidadFederativaId: v.union(v.string(), v.number()),
        Nombre: v.string(),
      }),
    ),
    municipalities: v.array(
      v.object({
        MunicipioId: v.union(v.string(), v.number()),
        EntidadFederativaId: v.union(v.string(), v.number()),
        Nombre: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString()

    const existingStates = await ctx.db.query('states').collect()
    const stateByExternalId = new Map(existingStates.map((row) => [row.externalId, row]))

    for (const state of args.states) {
      const externalId = stateId(state.EntidadFederativaId)
      const value = { externalId, name: normalizeText(state.Nombre), updatedAt }
      const existing = stateByExternalId.get(externalId)
      if (existing) {
        if (existing.name !== value.name) await ctx.db.patch(existing._id, value)
      } else {
        const newId = await ctx.db.insert('states', value)
        stateByExternalId.set(externalId, {
          _id: newId,
          _creationTime: Date.now(),
          ...value,
        })
      }
    }

    const existingMunicipalities = await ctx.db.query('municipalities').collect()
    const municipalityKey = (stateExternalId: string, externalId: string) =>
      `${stateExternalId}|${externalId}`
    const municipalityByKey = new Map(
      existingMunicipalities.map((row) => [municipalityKey(row.stateExternalId, row.externalId), row]),
    )

    let written = 0
    for (const municipality of args.municipalities) {
      const externalId = municipalityId(municipality.MunicipioId)
      const stateExternalId = stateId(municipality.EntidadFederativaId)
      const value = {
        externalId,
        stateExternalId,
        name: normalizeText(municipality.Nombre),
        updatedAt,
      }
      const key = municipalityKey(stateExternalId, externalId)
      const existing = municipalityByKey.get(key)
      if (existing) {
        if (existing.name !== value.name) await ctx.db.patch(existing._id, value)
      } else {
        const newId = await ctx.db.insert('municipalities', value)
        municipalityByKey.set(key, {
          _id: newId,
          _creationTime: Date.now(),
          ...value,
        })
      }
      written += 1
    }

    return { states: args.states.length, municipalities: written }
  },
})

export const applyMunicipalityPrices = internalMutation({
  args: {
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
    sourceUrl: v.string(),
    parentRunId: v.optional(v.id('ingestionRuns')),
    records: v.array(
      v.object({
        permitNumber: v.string(),
        name: v.string(),
        address: v.string(),
        product: v.string(),
        subproduct: v.string(),
        fuelType: fuelTypeValidator,
        price: v.number(),
        stateExternalId: v.string(),
        municipalityExternalId: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const startedAt = new Date().toISOString()
    const runId = await ctx.db.insert('ingestionRuns', {
      kind: 'municipality_prices',
      status: 'running',
      startedAt,
      stateExternalId: args.stateExternalId,
      municipalityExternalId: args.municipalityExternalId,
      sourceUrl: args.sourceUrl,
      recordsRead: args.records.length,
      parentRunId: args.parentRunId,
    })

    const state = await ctx.db
      .query('states')
      .withIndex('by_external_id', (q) => q.eq('externalId', args.stateExternalId))
      .unique()
    const municipality = await ctx.db
      .query('municipalities')
      .withIndex('by_external_id', (q) =>
        q
          .eq('stateExternalId', args.stateExternalId)
          .eq('externalId', args.municipalityExternalId),
      )
      .unique()

    // Load the municipality working set once. The former implementation ran
    // two indexed queries for every price row (300-400 queryStreamNext calls in
    // larger municipalities), starving public queries and hitting the backend
    // system timeout. These bulk index reads keep the working set bounded.
    const existingStations = await ctx.db
      .query('stations')
      .withIndex('by_location', (q) =>
        q
          .eq('stateExternalId', args.stateExternalId)
          .eq('municipalityExternalId', args.municipalityExternalId),
      )
      .collect()
    const existingPrices = await ctx.db
      .query('fuelPricesCurrent')
      .withIndex('by_location_fuel_price', (q) =>
        q
          .eq('stateExternalId', args.stateExternalId)
          .eq('municipalityExternalId', args.municipalityExternalId),
      )
      .collect()
    const existingListings = await ctx.db
      .query('stationListings')
      .withIndex('by_location', (q) =>
        q
          .eq('stateExternalId', args.stateExternalId)
          .eq('municipalityExternalId', args.municipalityExternalId),
      )
      .collect()

    const stationByPermit = new Map(
      existingStations.map((station) => [station.permitNumber, station]),
    )
    const pricesByStationFuel = new Map<string, typeof existingPrices>()
    const listingPricesByPermit = new Map<string, ListingPrices>()
    for (const price of existingPrices) {
      const key = `${price.stationPermitNumber}:${price.fuelType}`
      const prices = pricesByStationFuel.get(key)
      if (prices) prices.push(price)
      else pricesByStationFuel.set(key, [price])
      const listingPrices = listingPricesByPermit.get(price.stationPermitNumber) ?? {}
      listingPrices[price.fuelType] = {
        price: price.price,
        ...(price.reportedAt ? { reportedAt: price.reportedAt } : {}),
      }
      listingPricesByPermit.set(price.stationPermitNumber, listingPrices)
    }
    const listingByPermit = new Map(
      existingListings.map((listing) => [listing.permitNumber, listing]),
    )

    let processed = 0
    let changed = 0
    let newStations = 0
    const ingestedAt = new Date().toISOString()
    const stationRecords = new Map(
      args.records.map((record) => [record.permitNumber, record]),
    )

    // A station appears once per fuel in the CNE response; write it only once.
    for (const record of stationRecords.values()) {
      let existingStation = stationByPermit.get(record.permitNumber)
      if (!existingStation) {
        existingStation =
          (await ctx.db
            .query('stations')
            .withIndex('by_permit', (q) =>
              q.eq('permitNumber', record.permitNumber),
            )
            .unique()) ?? undefined
      }

      const stationValue = {
        permitNumber: record.permitNumber,
        name: record.name,
        address: record.address,
        stateExternalId: record.stateExternalId,
        municipalityExternalId: record.municipalityExternalId,
        stateName: state?.name,
        municipalityName: municipality?.name,
        source: 'CNE' as const,
        lastSeenAt: ingestedAt,
      }

      if (existingStation) {
        const metadataChanged =
          existingStation.name !== stationValue.name ||
          existingStation.address !== stationValue.address ||
          existingStation.stateExternalId !== stationValue.stateExternalId ||
          existingStation.municipalityExternalId !==
            stationValue.municipalityExternalId ||
          existingStation.stateName !== stationValue.stateName ||
          existingStation.municipalityName !== stationValue.municipalityName
        if (metadataChanged) {
          await ctx.db.patch(existingStation._id, stationValue)
          existingStation = { ...existingStation, ...stationValue }
        }
      } else {
        const stationId = await ctx.db.insert('stations', {
          ...stationValue,
          firstSeenAt: ingestedAt,
          coordinateStatus: 'pending',
        })
        existingStation = {
          _id: stationId,
          _creationTime: Date.now(),
          ...stationValue,
          firstSeenAt: ingestedAt,
          coordinateStatus: 'pending',
        }
        newStations += 1
      }
      stationByPermit.set(record.permitNumber, existingStation)
    }

    for (const record of args.records) {
      const currentPrices =
        pricesByStationFuel.get(`${record.permitNumber}:${record.fuelType}`) ?? []
      const [primary, ...duplicates] = currentPrices
      // Clean up any accidental duplicate current rows for this station+fuel.
      for (const dup of duplicates) {
        await ctx.db.delete(dup._id)
      }

      const priceValue = {
        stationPermitNumber: record.permitNumber,
        product: record.product,
        subproduct: record.subproduct,
        fuelType: record.fuelType,
        price: record.price,
        currency: 'MXN' as const,
        unit: 'litro' as const,
        stateExternalId: record.stateExternalId,
        municipalityExternalId: record.municipalityExternalId,
        ingestedAt,
        source: 'CNE' as const,
      }

      processed += 1
      const listingPrices = listingPricesByPermit.get(record.permitNumber) ?? {}
      listingPrices[record.fuelType] = {
        price: record.price,
      }
      listingPricesByPermit.set(record.permitNumber, listingPrices)

      // Only touch the current row and append history when the price actually
      // changed. Most stations report the same price for days, so this avoids
      // storing an identical snapshot on every run.
      if (!primary) {
        await ctx.db.insert('fuelPricesCurrent', priceValue)
        await ctx.db.insert('fuelPricesHistory', { ...priceValue, runId })
        changed += 1
      } else if (primary.price !== record.price) {
        await ctx.db.patch(primary._id, priceValue)
        await ctx.db.insert('fuelPricesHistory', { ...priceValue, runId })
        changed += 1
      }
    }

    for (const record of stationRecords.values()) {
      const station = stationByPermit.get(record.permitNumber)
      if (!station) continue
      await upsertStationListing(ctx, {
        station,
        prices: listingPricesByPermit.get(record.permitNumber) ?? {},
        existing: listingByPermit.get(record.permitNumber),
      })
    }

    await ctx.db.patch(runId, {
      status: processed > 0 ? 'success' : 'skipped',
      finishedAt: new Date().toISOString(),
      recordsWritten: changed,
      message:
        processed > 0
          ? `Procesados ${processed} precios, ${changed} con cambios.`
          : 'La fuente no regreso precios validos para este municipio.',
    })

    return { runId, recordsWritten: changed, newStations }
  },
})

export const recordFailure = internalMutation({
  args: {
    kind: v.union(
      v.literal('catalog'),
      v.literal('municipality_prices'),
      v.literal('xml_snapshot'),
      v.literal('daily_queue'),
    ),
    sourceUrl: v.optional(v.string()),
    stateExternalId: v.optional(v.string()),
    municipalityExternalId: v.optional(v.string()),
    parentRunId: v.optional(v.id('ingestionRuns')),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString()
    return await ctx.db.insert('ingestionRuns', {
      kind: args.kind,
      status: 'failed',
      startedAt: now,
      finishedAt: now,
      sourceUrl: args.sourceUrl,
      stateExternalId: args.stateExternalId,
      municipalityExternalId: args.municipalityExternalId,
      parentRunId: args.parentRunId,
      message: args.message,
    })
  },
})

export const latestDailyQueueRun = internalQuery({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query('ingestionRuns')
      .withIndex('by_kind_started', (q) => q.eq('kind', 'daily_queue'))
      .order('desc')
      .take(1)

    return runs[0] ?? null
  },
})

export const startDailyQueue = internalMutation({
  args: {
    queuedMunicipalities: v.number(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString()

    return await ctx.db.insert('ingestionRuns', {
      kind: 'daily_queue',
      status: args.queuedMunicipalities > 0 ? 'running' : 'skipped',
      startedAt: now,
      finishedAt: args.queuedMunicipalities > 0 ? undefined : now,
      recordsRead: args.queuedMunicipalities,
      recordsWritten: 0,
      cursor: null,
      failedCount: 0,
      newStations: 0,
      heartbeatAt: now,
      message: args.message,
    })
  },
})

export const updateDailyQueueProgress = internalMutation({
  args: {
    runId: v.id('ingestionRuns'),
    processed: v.number(),
    failed: v.number(),
    expectedCursor: v.optional(v.union(v.string(), v.null())),
    nextCursor: v.optional(v.union(v.string(), v.null())),
    newStations: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.kind !== 'daily_queue' || run.status !== 'running') return false
    if (
      args.expectedCursor !== undefined &&
      (run.cursor ?? null) !== args.expectedCursor
    ) {
      return false
    }

    const recordsWritten = (run.recordsWritten ?? 0) + args.processed
    await ctx.db.patch(args.runId, {
      recordsWritten,
      cursor:
        args.nextCursor !== undefined ? args.nextCursor : run.cursor ?? null,
      failedCount: args.failed,
      newStations: (run.newStations ?? 0) + (args.newStations ?? 0),
      heartbeatAt: new Date().toISOString(),
      message: `Procesados ${recordsWritten} de ${run.recordsRead ?? 0} municipios; ${args.failed} fallidos hasta ahora.`,
    })
    return true
  },
})

export const completeDailyQueue = internalMutation({
  args: {
    runId: v.id('ingestionRuns'),
    failed: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.kind !== 'daily_queue' || run.status !== 'running') return

    const processed = run.recordsWritten ?? 0
    await ctx.db.patch(args.runId, {
      status: 'success',
      finishedAt: new Date().toISOString(),
      message: `Carga nacional terminada: ${processed} municipios procesados; ${args.failed} fallidos.`,
    })
    return {
      newStations: run.newStations ?? 0,
      failed: args.failed,
      processed,
    }
  },
})

export const getDailyQueueState = internalQuery({
  args: { runId: v.id('ingestionRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    return run?.kind === 'daily_queue' ? run : null
  },
})

// Scheduler watchdog. Claiming and scheduling happen transactionally, so
// repeated cron ticks cannot create a recovery stampede.
export const resumeStaleDailyQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db
      .query('ingestionRuns')
      .withIndex('by_kind_status_started', (q) =>
        q.eq('kind', 'daily_queue').eq('status', 'running'),
      )
      .order('desc')
      .first()
    if (!latest) return { resumed: false }
    const heartbeat = Date.parse(latest.heartbeatAt ?? latest.startedAt)
    if (Number.isFinite(heartbeat) && Date.now() - heartbeat < 10 * 60 * 1000) {
      return { resumed: false }
    }
    const now = new Date().toISOString()
    await ctx.db.patch(latest._id, { heartbeatAt: now })
    await ctx.scheduler.runAfter(0, internal.ingestion.runMunicipalityRefreshWorker, {
      runId: latest._id,
      cursor: latest.cursor ?? null,
      failed: latest.failedCount ?? 0,
    })
    return { resumed: true, runId: latest._id }
  },
})

export const purgeOldIngestionRuns = internalMutation({
  args: {
    kind: v.union(v.literal('municipality_prices'), v.literal('daily_queue')),
    cutoff: v.string(),
    status: v.union(
      v.literal('success'),
      v.literal('skipped'),
      v.literal('failed'),
    ),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('ingestionRuns')
      .withIndex('by_kind_status_started', (q) =>
        q
          .eq('kind', args.kind)
          .eq('status', args.status)
          .lt('startedAt', args.cutoff),
      )
      .take(100)
    for (const run of rows) {
      await ctx.db.delete(run._id)
    }
    if (rows.length === 100) {
      await ctx.scheduler.runAfter(
        0,
        internal.ingestion.purgeOldIngestionRuns,
        { kind: args.kind, cutoff: args.cutoff, status: args.status },
      )
    }
    return { deleted: rows.length, isDone: rows.length < 100 }
  },
})

export const startIngestionRetention = internalMutation({
  args: {},
  handler: async (ctx) => {
    const municipalityCutoff = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString()
    for (const status of ['success', 'skipped'] as const) {
      await ctx.scheduler.runAfter(
        0,
        internal.ingestion.purgeOldIngestionRuns,
        { kind: 'municipality_prices', cutoff: municipalityCutoff, status },
      )
    }
    const auditCutoff = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString()
    for (const status of ['failed', 'success', 'skipped'] as const) {
      await ctx.scheduler.runAfter(
        0,
        internal.ingestion.purgeOldIngestionRuns,
        { kind: 'daily_queue', cutoff: auditCutoff, status },
      )
    }
    await ctx.scheduler.runAfter(0, internal.ingestion.purgeOldIngestionRuns, {
      kind: 'municipality_prices',
      cutoff: auditCutoff,
      status: 'failed',
    })
    return { municipalityCutoff, auditCutoff }
  },
})

export const requeueStaleFailedGeocodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const rows = await ctx.db
      .query('stations')
      .withIndex('by_coordinate_status_checked', (q) =>
        q
          .eq('coordinateStatus', 'failed')
          .lt('coordinateCheckedAt', cutoff),
      )
      .take(100)
    for (const row of rows) {
      await ctx.db.patch(row._id, { coordinateStatus: 'pending' })
    }
    if (rows.length === 100) {
      await ctx.scheduler.runAfter(
        0,
        internal.ingestion.requeueStaleFailedGeocodes,
        {},
      )
    }
    return { requeued: rows.length }
  },
})

export const recordXmlSnapshot = internalMutation({
  args: {
    kind: v.union(v.literal('cne_prices_xml'), v.literal('cne_places_xml')),
    sourceUrl: v.string(),
    contentLength: v.number(),
    placeCount: v.number(),
    priceCount: v.number(),
    sample: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString()
    const runId = await ctx.db.insert('ingestionRuns', {
      kind: 'xml_snapshot',
      status: args.placeCount > 0 && args.priceCount > 0 ? 'success' : 'skipped',
      startedAt: now,
      finishedAt: now,
      sourceUrl: args.sourceUrl,
      recordsRead: args.priceCount,
      recordsWritten: 1,
      message:
        args.placeCount > 0 && args.priceCount > 0
          ? 'Snapshot XML validado.'
          : 'El XML no contiene places/precios validos.',
    })

    if (args.placeCount > 0 && args.priceCount > 0) {
      await ctx.db.insert('rawSnapshots', {
        kind: args.kind,
        sourceUrl: args.sourceUrl,
        fetchedAt: now,
        contentLength: args.contentLength,
        placeCount: args.placeCount,
        priceCount: args.priceCount,
        sample: args.sample,
        runId,
      })
    }

    return { runId }
  },
})

// Chunks for the places-vs-stations matching pass. Each mutation does one
// indexed `by_permit` lookup per place, so the chunk size has to be small
// enough to keep the mutation under its per-call op budget. Empirically the
// self-hosted backend fails the mutation around a few hundred lookups.
const PLACES_MATCH_CHUNK = 50
const PLACES_BATCH_START_STAGGER_MS = 500

export const matchPlacesBatch = internalMutation({
  args: {
    places: v.array(
      v.object({
        placeId: v.string(),
        permitNumber: v.string(),
        name: v.string(),
        latitude: v.number(),
        longitude: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.places.length === 0) return { matched: 0 }

    let matched = 0
    let updated = 0
    for (const place of args.places) {
      const existing = await ctx.db
        .query('stations')
        .withIndex('by_permit', (q) => q.eq('permitNumber', place.permitNumber))
        .unique()
      if (!existing) continue
      const bounds = await ctx.db
        .query('locationBounds')
        .withIndex('by_key', (q) =>
          q.eq(
            'key',
            `${existing.stateExternalId}|${existing.municipalityExternalId}`,
          ),
        )
        .unique()
      if (
        !coordinateWithinBounds(
          place.latitude,
          place.longitude,
          bounds,
        )
      ) {
        continue
      }
      const latBucket = latBucketFor(place.latitude)
      const changed =
        existing.placeId !== place.placeId ||
        existing.latitude !== place.latitude ||
        existing.longitude !== place.longitude ||
        existing.latBucket !== latBucket ||
        existing.coordinateStatus !== 'located'
      if (changed) {
        const checkedAt = new Date().toISOString()
        await ctx.db.patch(existing._id, {
          placeId: place.placeId,
          latitude: place.latitude,
          longitude: place.longitude,
          latBucket,
          coordinateStatus: 'located',
          coordinateCheckedAt: checkedAt,
          name: existing.name || place.name,
        })
        const listing = await ctx.db
          .query('stationListings')
          .withIndex('by_permit', (q) =>
            q.eq('permitNumber', place.permitNumber),
          )
          .unique()
        if (listing) {
          await ctx.db.patch(listing._id, {
            latitude: place.latitude,
            longitude: place.longitude,
            latBucket,
            updatedAt: checkedAt,
          })
        }
        updated += 1
      }
      matched += 1
    }
    return { matched, updated }
  },
})

export const listPendingCoordinatePermits = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('stations')
      .withIndex('by_coordinate_status', (q) =>
        q.eq('coordinateStatus', 'pending'),
      )
      .take(args.limit)
    return rows.map((row) => row.permitNumber)
  },
})

export const recordPlacesRun = internalMutation({
  args: {
    sourceUrl: v.string(),
    contentLength: v.number(),
    sample: v.string(),
    placeCount: v.number(),
    matched: v.number(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString()
    const runId = await ctx.db.insert('ingestionRuns', {
      kind: 'xml_snapshot',
      status: args.placeCount > 0 ? 'success' : 'skipped',
      startedAt: now,
      finishedAt: now,
      sourceUrl: args.sourceUrl,
      recordsRead: args.placeCount,
      recordsWritten: args.matched,
      message:
        args.message ??
        (args.placeCount > 0
          ? `Se validaron ${args.placeCount} ubicaciones, ${args.matched} estaciones georreferenciadas.`
          : 'El XML de ubicaciones no contiene places validos.'),
    })

    if (args.placeCount > 0) {
      await ctx.db.insert('rawSnapshots', {
        kind: 'cne_places_xml',
        sourceUrl: args.sourceUrl,
        fetchedAt: now,
        contentLength: args.contentLength,
        placeCount: args.placeCount,
        priceCount: 0,
        sample: args.sample,
        runId,
      })
    }

    return { runId }
  },
})

export const refreshMunicipalityInternal = internalAction({
  args: {
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
  },
  handler: async (): Promise<MunicipalityRefreshResult & { skipped: true }> => {
    // Legacy fan-out jobs used this function name. Keep it as a no-op until
    // those durable scheduled entries have drained after deployment.
    return { runId: null, recordsWritten: 0, newStations: 0, skipped: true }
  },
})

export const refreshMunicipalityNow = internalAction({
  args: {
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
  },
  handler: async (ctx, args): Promise<MunicipalityRefreshResult> => {
    return await refreshMunicipalityData(ctx, args.stateExternalId, args.municipalityExternalId)
  },
})

export const listMunicipalityRefreshPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    return await ctx.db.query('municipalities').paginate({
      cursor: args.cursor,
      numItems: MUNICIPALITY_REFRESH_PAGE_SIZE,
    })
  },
})

export const runMunicipalityRefreshWorker = internalAction({
  args: {
    runId: v.id('ingestionRuns'),
    cursor: v.union(v.string(), v.null()),
    failed: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; failed: number; isDone: boolean }> => {
    const run = await ctx.runQuery(internal.ingestion.getDailyQueueState, {
      runId: args.runId,
    })
    if (
      !run ||
      run.status !== 'running' ||
      (run.cursor ?? null) !== args.cursor
    ) {
      return { processed: 0, failed: run?.failedCount ?? args.failed, isDone: true }
    }
    const page = await ctx.runQuery(internal.ingestion.listMunicipalityRefreshPage, {
      cursor: args.cursor,
    })

    let processed = 0
    let failed = run.failedCount ?? args.failed
    let newStations = 0
    for (const municipality of page.page) {
      try {
        const result = await refreshMunicipalityData(
          ctx,
          municipality.stateExternalId,
          municipality.externalId,
          args.runId,
        )
        newStations += result.newStations
      } catch {
        // refreshMunicipalityData already records the failure. Continue so one
        // bad municipality cannot strand the rest of the national refresh.
        failed += 1
      }
      processed += 1
    }

    const advanced = await ctx.runMutation(internal.ingestion.updateDailyQueueProgress, {
      runId: args.runId,
      processed,
      failed,
      expectedCursor: args.cursor,
      nextCursor: page.continueCursor,
      newStations,
    })
    if (!advanced) return { processed: 0, failed, isDone: page.isDone }

    if (page.isDone) {
      const completion = await ctx.runMutation(internal.ingestion.completeDailyQueue, {
        runId: args.runId,
        failed,
      })
      if ((completion?.newStations ?? 0) > 0) {
        await ctx.scheduler.runAfter(0, internal.ingestion.capturePlacesSnapshot, {
          pendingOnly: true,
          continueMaintenance: true,
        })
      } else {
        await ctx.scheduler.runAfter(
          0,
          internal.stations.rebuildFilterOptionsCache,
          { scheduleMetrics: true },
        )
      }
    } else {
      await ctx.scheduler.runAfter(
        MUNICIPALITY_PAGE_PAUSE_MS,
        internal.ingestion.runMunicipalityRefreshWorker,
        {
          runId: args.runId,
          cursor: page.continueCursor,
          failed,
        },
      )
    }

    return { processed, failed, isDone: page.isDone }
  },
})

export const captureXmlSnapshot = internalAction({
  args: {},
  handler: async (ctx): Promise<SnapshotResult> => {
    try {
      const response = await fetch(CNE_XML_URL, {
        headers: {
          accept: 'application/xml,text/xml,*/*',
          'user-agent': 'Litrito/0.1 (+https://cne.gob.mx)',
        },
      })

      if (!response.ok) {
        throw new Error(`XML request failed: ${response.status} ${response.statusText}`)
      }

      const xml = await response.text()
      const placeCount = (xml.match(/<place\b/g) ?? []).length
      const priceCount = (xml.match(/<gas_price\b/g) ?? []).length

      return await ctx.runMutation(internal.ingestion.recordXmlSnapshot, {
        sourceUrl: CNE_XML_URL,
        kind: 'cne_prices_xml',
        contentLength: xml.length,
        placeCount,
        priceCount,
        sample: xml.slice(0, 1800),
      })
    } catch (error) {
      await ctx.runMutation(internal.ingestion.recordFailure, {
        kind: 'xml_snapshot',
        sourceUrl: CNE_XML_URL,
        message: error instanceof Error ? error.message : 'XML snapshot failed',
      })
      throw error
    }
  },
})

export const capturePlacesSnapshot = internalAction({
  args: {
    pendingOnly: v.optional(v.boolean()),
    continueMaintenance: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<PlacesSnapshotResult> => {
    try {
      const pendingPermits = args.pendingOnly
        ? await ctx.runQuery(internal.ingestion.listPendingCoordinatePermits, {
            limit: 5_000,
          })
        : null
      if (pendingPermits && pendingPermits.length === 0) {
        if (args.continueMaintenance) {
          await ctx.scheduler.runAfter(
            0,
            internal.stations.rebuildFilterOptionsCache,
            { scheduleMetrics: true },
          )
        }
        return { runId: null, places: 0 }
      }
      const response = await fetch(CNE_PLACES_URL, {
        headers: {
          accept: 'application/xml,text/xml,*/*',
          'user-agent': 'Litrito/1.0 (+https://litrito.mx)',
          origin: 'https://www.cne.gob.mx',
          referer: 'https://www.cne.gob.mx/',
        },
      })

      if (!response.ok) {
        throw new Error(`Places request failed: ${response.status} ${response.statusText}`)
      }

      const xml = await response.text()
      const allPlaces = parsePlaceRows(
        xml,
        pendingPermits ? new Set(pendingPermits) : undefined,
      )

      // Run small matching mutations serially. This stays under the per-call
      // operation budget without leaving dozens of scheduled writes that all
      // become due together after a backend restart.
      const batchCount = Math.max(1, Math.ceil(allPlaces.length / PLACES_MATCH_CHUNK))
      let matched = 0
      let updated = 0
      for (let i = 0; i < allPlaces.length; i += PLACES_MATCH_CHUNK) {
        const slice = allPlaces.slice(i, i + PLACES_MATCH_CHUNK)
        const result = await ctx.runMutation(internal.ingestion.matchPlacesBatch, {
          places: slice,
        })
        matched += result.matched
        updated += result.updated ?? 0
        if (i + PLACES_MATCH_CHUNK < allPlaces.length) {
          await sleep(PLACES_BATCH_START_STAGGER_MS)
        }
      }

      const { runId } = await ctx.runMutation(internal.ingestion.recordPlacesRun, {
        sourceUrl: CNE_PLACES_URL,
        contentLength: xml.length,
        sample: xml.slice(0, 1800),
        placeCount: allPlaces.length,
        matched,
        message: `Snapshot XML validado. ${matched} estaciones enlazadas y ${updated} actualizadas en ${batchCount} lote(s).`,
      })

      if (args.continueMaintenance) {
        await ctx.scheduler.runAfter(
          0,
          internal.stations.rebuildFilterOptionsCache,
          { scheduleMetrics: true },
        )
      }

      return { runId, places: allPlaces.length }
    } catch (error) {
      await ctx.runMutation(internal.ingestion.recordFailure, {
        kind: 'xml_snapshot',
        sourceUrl: CNE_PLACES_URL,
        message: error instanceof Error ? error.message : 'Places snapshot failed',
      })
      if (args.continueMaintenance) {
        await ctx.scheduler.runAfter(
          0,
          internal.stations.rebuildFilterOptionsCache,
          { scheduleMetrics: true },
        )
      }
      throw error
    }
  },
})

export const refreshPlaces = action({
  args: {},
  handler: async (ctx): Promise<PlacesSnapshotResult> => {
    return await ctx.runAction(internal.ingestion.capturePlacesSnapshot, {
      pendingOnly: false,
      continueMaintenance: false,
    })
  },
})

function isSameUtcDay(iso: string, now: Date): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  )
}

export const queueDailyRefresh = internalAction({
  args: {},
  handler: async (ctx): Promise<QueueDailyRefreshResult> => {
    // The cron fires a primary run plus several retries. Only do real work if
    // today's national queue succeeded or still has a live worker. A stale
    // running marker eventually expires so a later retry can recover it.
    const latest = await ctx.runQuery(internal.ingestion.latestDailyQueueRun, {})
    const now = new Date()
    const latestStartedAt = latest ? Date.parse(latest.startedAt) : 0
    const latestAgeMs = Number.isFinite(latestStartedAt)
      ? Date.now() - latestStartedAt
      : Infinity
    if (
      latest &&
      isSameUtcDay(latest.startedAt, now) &&
      (latest.status === 'success' ||
        (latest.status === 'running' && latestAgeMs < ACTIVE_DAILY_QUEUE_TIMEOUT_MS))
    ) {
      return {
        queuedMunicipalities: 0,
        skipped: true,
        message: 'La carga nacional ya se encoló hoy; retry omitido.',
      }
    }
    return await queueNationalRefresh(ctx)
  },
})

export const bootstrapNationalRefresh = action({
  args: {},
  handler: async (ctx): Promise<QueueDailyRefreshResult> => {
    const latestQueueRun = await ctx.runQuery(internal.ingestion.latestDailyQueueRun, {})
    const startedAt = latestQueueRun?.startedAt
      ? Date.parse(latestQueueRun.startedAt)
      : 0
    const ageMs = Number.isFinite(startedAt) ? Date.now() - startedAt : Infinity
    const queuedRecently =
      ageMs < 30 * 60 * 1000 ||
      (latestQueueRun?.status === 'running' && ageMs < ACTIVE_DAILY_QUEUE_TIMEOUT_MS)

    if (queuedRecently) {
      return {
        queuedMunicipalities: 0,
        skipped: true,
        message: 'Ya hay una carga nacional reciente en proceso.',
      }
    }

    return await queueNationalRefresh(ctx)
  },
})

async function refreshMunicipalityData(
  ctx: ActionCtx,
  rawStateExternalId: string,
  rawMunicipalityExternalId: string,
  parentRunId?: Id<'ingestionRuns'>,
): Promise<MunicipalityRefreshResult> {
  const stateExternalId = stateId(rawStateExternalId)
  const municipalityExternalId = municipalityId(rawMunicipalityExternalId)
  const sourceUrl = `${CNE_REPORT_URL}?entidadId=${stateExternalId}&municipioId=${municipalityExternalId}`

  try {
    const response = await fetchJson<unknown>(sourceUrl)
    const value = unwrapEnvelope<CnePrice[]>(response, sourceUrl)
    const { rows, mismatches } = normalizePriceRows(value ?? [], {
      stateExternalId,
      municipalityExternalId,
    })

    if (mismatches > 0) {
      console.warn(
        `[ingestion] ${mismatches} filas con EntidadFederativaId/MunicipioId no coincidente en ${sourceUrl}`,
      )
    }

    return await ctx.runMutation(internal.ingestion.applyMunicipalityPrices, {
      stateExternalId,
      municipalityExternalId,
      sourceUrl,
      records: rows,
      parentRunId,
    })
  } catch (error) {
    await ctx.runMutation(internal.ingestion.recordFailure, {
      kind: 'municipality_prices',
      sourceUrl,
      stateExternalId,
      municipalityExternalId,
      parentRunId,
      message: error instanceof Error ? error.message : 'Municipality refresh failed',
    })
    throw error
  }
}

async function queueNationalRefresh(ctx: ActionCtx): Promise<QueueDailyRefreshResult> {
  try {
    const catalog = await fetchCatalog()
    await ctx.runMutation(internal.ingestion.applyCatalog, catalog)
    await ctx.scheduler.runAfter(0, internal.ingestion.captureXmlSnapshot, {})

    const totalMunicipalities = catalog.municipalities.length
    const runId = await ctx.runMutation(internal.ingestion.startDailyQueue, {
      queuedMunicipalities: totalMunicipalities,
      message: `Carga nacional encolada para ${totalMunicipalities} municipios con un worker secuencial.`,
    })

    if (totalMunicipalities > 0) {
      await ctx.scheduler.runAfter(0, internal.ingestion.runMunicipalityRefreshWorker, {
        runId,
        cursor: null,
        failed: 0,
      })
    }

    return {
      queuedMunicipalities: totalMunicipalities,
    }
  } catch (error) {
    await ctx.runMutation(internal.ingestion.recordFailure, {
      kind: 'daily_queue',
      message: error instanceof Error ? error.message : 'Daily refresh queue failed',
    })
    throw error
  }
}

type GeocodeResult = {
  processed: number
  geocoded: number
  failed: number
  remaining: number
  done: boolean
}

type NominatimHit = { lat: string; lon: string; display_name?: string }

async function geocodeWithNominatim(query: string): Promise<NominatimHit | null> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'mx')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Litrito/1.0 (+https://litrito.mx; geocoding)',
      referer: 'https://litrito.mx/',
    },
  })

  if (!response.ok) {
    throw new Error(`Nominatim request failed: ${response.status} ${response.statusText}`)
  }

  const hits = (await response.json()) as NominatimHit[]
  return hits[0] ?? null
}

function buildGeocodeQuery(input: {
  address?: string | null
  municipalityName?: string | null
  stateName?: string | null
}): string | null {
  const parts = [input.address, input.municipalityName, input.stateName, 'México']
    .map((part) => normalizeText(part ?? ''))
    .filter(Boolean)
  if (parts.length <= 1) return null
  return parts.join(', ')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const listStationsNeedingGeocode = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const candidates = await ctx.db
      .query('stations')
      .withIndex('by_coordinate_status', (q) =>
        q.eq('coordinateStatus', 'pending'),
      )
      .take(args.limit)
    return candidates.map((station) => ({
      _id: station._id,
      permitNumber: station.permitNumber,
      address: station.address,
      stateName: station.stateName ?? null,
      municipalityName: station.municipalityName ?? null,
    }))
  },
})

export const patchStationCoordinates = internalMutation({
  args: {
    stationId: v.id('stations'),
    latitude: v.number(),
    longitude: v.number(),
  },
  handler: async (ctx, args) => {
    const station = await ctx.db.get(args.stationId)
    if (!station) return false
    const bounds = await ctx.db
      .query('locationBounds')
      .withIndex('by_key', (q) =>
        q.eq(
          'key',
          `${station.stateExternalId}|${station.municipalityExternalId}`,
        ),
      )
      .unique()
    if (!coordinateWithinBounds(args.latitude, args.longitude, bounds)) {
      await ctx.db.patch(args.stationId, {
        coordinateStatus: 'failed',
        coordinateCheckedAt: new Date().toISOString(),
      })
      return false
    }
    const checkedAt = new Date().toISOString()
    await ctx.db.patch(args.stationId, {
      latitude: args.latitude,
      longitude: args.longitude,
      latBucket: latBucketFor(args.latitude),
      coordinateStatus: 'located',
      coordinateCheckedAt: checkedAt,
    })
    const listing = await ctx.db
      .query('stationListings')
      .withIndex('by_permit', (q) =>
        q.eq('permitNumber', station.permitNumber),
      )
      .unique()
    if (listing) {
      await ctx.db.patch(listing._id, {
        latitude: args.latitude,
        longitude: args.longitude,
        latBucket: latBucketFor(args.latitude),
        updatedAt: checkedAt,
      })
    }
    return true
  },
})

// Repairs bad coordinates already accepted from CNE's places XML. The source
// occasionally publishes a point in a different state; municipality bounds
// prevent those stations from polluting nearby/map results.
export const validateStationCoordinates = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    if (args.cursor === undefined) {
      const ready = await ctx.db
        .query('filterOptionsCache')
        .withIndex('by_key', (q) =>
          q.eq('key', 'station-coordinate-validation-ready'),
        )
        .unique()
      if (ready) await ctx.db.delete(ready._id)
    }

    const page = await ctx.db
      .query('stations')
      .paginate({ cursor: args.cursor ?? null, numItems: 40 })
    const boundsByKey = new Map<string, CoordinateBounds | null>()
    let invalid = 0
    for (const station of page.page) {
      if (
        typeof station.latitude !== 'number' ||
        typeof station.longitude !== 'number'
      ) {
        continue
      }
      const key = `${station.stateExternalId}|${station.municipalityExternalId}`
      let bounds = boundsByKey.get(key)
      if (bounds === undefined) {
        bounds = await ctx.db
          .query('locationBounds')
          .withIndex('by_key', (q) => q.eq('key', key))
          .unique()
        boundsByKey.set(key, bounds)
      }
      if (coordinateWithinBounds(station.latitude, station.longitude, bounds)) {
        continue
      }

      const checkedAt = new Date().toISOString()
      await ctx.db.patch(station._id, {
        placeId: undefined,
        latitude: undefined,
        longitude: undefined,
        latBucket: undefined,
        coordinateStatus: 'pending',
        coordinateCheckedAt: checkedAt,
      })
      const listing = await ctx.db
        .query('stationListings')
        .withIndex('by_permit', (q) =>
          q.eq('permitNumber', station.permitNumber),
        )
        .unique()
      if (listing) {
        await ctx.db.patch(listing._id, {
          latitude: undefined,
          longitude: undefined,
          latBucket: undefined,
          updatedAt: checkedAt,
        })
      }
      invalid += 1
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.ingestion.validateStationCoordinates,
        { cursor: page.continueCursor },
      )
    } else {
      const readyAt = new Date().toISOString()
      await ctx.db.insert('filterOptionsCache', {
        key: 'station-coordinate-validation-ready',
        data: JSON.stringify({ ready: true, readyAt }),
        updatedAt: readyAt,
      })
      await ctx.scheduler.runAfter(
        0,
        internal.ingestion.geocodeStationsInternal,
        {},
      )
    }
    return { processed: page.page.length, invalid, isDone: page.isDone }
  },
})

export const getCoordinateValidationStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const ready = await ctx.db
      .query('filterOptionsCache')
      .withIndex('by_key', (q) =>
        q.eq('key', 'station-coordinate-validation-ready'),
      )
      .unique()
    return { ready: Boolean(ready), readyAt: ready?.updatedAt ?? null }
  },
})

export const markStationGeocodeFailed = internalMutation({
  args: { stationId: v.id('stations') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stationId, {
      coordinateStatus: 'failed',
      coordinateCheckedAt: new Date().toISOString(),
    })
  },
})

export const recordGeocodingRun = internalMutation({
  args: {
    status: runStatusValidator,
    processed: v.number(),
    geocoded: v.number(),
    failed: v.number(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString()
    return await ctx.db.insert('ingestionRuns', {
      kind: 'geocoding',
      status: args.status,
      startedAt: now,
      finishedAt: args.status === 'running' ? undefined : now,
      recordsRead: args.processed,
      recordsWritten: args.geocoded,
      message:
        args.message ??
        `Geocoding: ${args.geocoded}/${args.processed} exitosos, ${args.failed} fallidos.`,
    })
  },
})

export const geocodeStationsInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<GeocodeResult> => {
    const candidates = await ctx.runQuery(
      internal.ingestion.listStationsNeedingGeocode,
      { limit: GEOCODE_BATCH_SIZE },
    )

    if (candidates.length === 0) {
      await ctx.runMutation(internal.ingestion.recordGeocodingRun, {
        status: 'success',
        processed: 0,
        geocoded: 0,
        failed: 0,
        message: 'No hay estaciones pendientes de geocodificar.',
      })
      return { processed: 0, geocoded: 0, failed: 0, remaining: 0, done: true }
    }

    let geocoded = 0
    let failed = 0

    for (const station of candidates) {
      const query = buildGeocodeQuery(station)
      if (!query) {
        failed += 1
        await ctx.runMutation(internal.ingestion.markStationGeocodeFailed, {
          stationId: station._id,
        })
        await sleep(NOMINATIM_MIN_INTERVAL_MS)
        continue
      }

      try {
        const hit = await geocodeWithNominatim(query)
        if (hit) {
          const latitude = Number(hit.lat)
          const longitude = Number(hit.lon)
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            const accepted = await ctx.runMutation(
              internal.ingestion.patchStationCoordinates,
              {
              stationId: station._id,
              latitude,
              longitude,
              },
            )
            if (accepted) geocoded += 1
            else failed += 1
          } else {
            failed += 1
            await ctx.runMutation(internal.ingestion.markStationGeocodeFailed, {
              stationId: station._id,
            })
          }
        } else {
          failed += 1
          await ctx.runMutation(internal.ingestion.markStationGeocodeFailed, {
            stationId: station._id,
          })
        }
      } catch (error) {
        console.warn(`[ingestion] geocode failed for ${station.permitNumber}:`, error)
        failed += 1
      }

      await sleep(NOMINATIM_MIN_INTERVAL_MS)
    }

    const done = candidates.length < GEOCODE_BATCH_SIZE

    await ctx.runMutation(internal.ingestion.recordGeocodingRun, {
      status: done ? 'success' : 'running',
      processed: candidates.length,
      geocoded,
      failed,
      message: done
        ? `Lote final: ${geocoded}/${candidates.length} geocodificadas, ${failed} fallidas.`
        : `Lote parcial: ${geocoded}/${candidates.length} geocodificadas, ${failed} fallidas. Continúa en próximo cron.`,
    })

    if (!done) {
      const retryDelayMs = geocoded === 0 && failed > 0 ? 60 * 60_000 : 60_000
      await ctx.scheduler.runAfter(
        retryDelayMs,
        internal.ingestion.geocodeStationsInternal,
        {},
      )
    }

    return {
      processed: candidates.length,
      geocoded,
      failed,
      remaining: done ? 0 : -1,
      done,
    }
  },
})

export const geocodeStations = action({
  args: {},
  handler: async (ctx): Promise<GeocodeResult> => {
    return await ctx.runAction(internal.ingestion.geocodeStationsInternal, {})
  },
})

export const runNationalBulkRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal.ingestion.geocodeStationsInternal, {})
    return { ok: true as const }
  },
})
