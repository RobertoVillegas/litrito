import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import { latBucketFor } from './geocells'
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
const GEOCODE_BATCH_SIZE = 300

// Convex actions cap at 1000 system operations per invocation. Each
// `ctx.scheduler.runAfter` counts as one, so chunk municipality refreshes into
// batches that fit comfortably under the limit and run in parallel.
const MUNICIPALITY_BATCH_SIZE = 800
const MUNICIPALITY_REFRESH_STAGGER_MS = 750
const MUNICIPALITY_BATCH_START_STAGGER_MS = 2_000

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
}

type SnapshotResult = {
  runId: unknown
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
    const duplicateKey = `${permitNumber}:${fuel}:${price}`

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

function parsePlaceRows(xml: string): CnePlace[] {
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
    const stateIdByExternalId = new Map(existingStates.map((row) => [row.externalId, row._id]))

    for (const state of args.states) {
      const externalId = stateId(state.EntidadFederativaId)
      const value = { externalId, name: normalizeText(state.Nombre), updatedAt }
      const existingId = stateIdByExternalId.get(externalId)
      if (existingId) {
        await ctx.db.patch(existingId, value)
      } else {
        const newId = await ctx.db.insert('states', value)
        stateIdByExternalId.set(externalId, newId)
      }
    }

    const existingMunicipalities = await ctx.db.query('municipalities').collect()
    const municipalityKey = (stateExternalId: string, externalId: string) =>
      `${stateExternalId}|${externalId}`
    const municipalityIdByKey = new Map(
      existingMunicipalities.map((row) => [municipalityKey(row.stateExternalId, row.externalId), row._id]),
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
      const existingId = municipalityIdByKey.get(key)
      if (existingId) {
        await ctx.db.patch(existingId, value)
      } else {
        const newId = await ctx.db.insert('municipalities', value)
        municipalityIdByKey.set(key, newId)
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

    let processed = 0
    let changed = 0
    const ingestedAt = new Date().toISOString()

    for (const record of args.records) {
      const existingStation = await ctx.db
        .query('stations')
        .withIndex('by_permit', (q) => q.eq('permitNumber', record.permitNumber))
        .unique()

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
        await ctx.db.patch(existingStation._id, stationValue)
      } else {
        await ctx.db.insert('stations', {
          ...stationValue,
          firstSeenAt: ingestedAt,
        })
      }

      const currentPrices = await ctx.db
        .query('fuelPricesCurrent')
        .withIndex('by_station_fuel', (q) =>
          q
            .eq('stationPermitNumber', record.permitNumber)
            .eq('fuelType', record.fuelType),
        )
        .collect()

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

    await ctx.db.patch(runId, {
      status: processed > 0 ? 'success' : 'skipped',
      finishedAt: new Date().toISOString(),
      recordsWritten: changed,
      message:
        processed > 0
          ? `Procesados ${processed} precios, ${changed} con cambios.`
          : 'La fuente no regreso precios validos para este municipio.',
    })

    return { runId, recordsWritten: changed }
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

export const recordDailyQueue = internalMutation({
  args: {
    queuedMunicipalities: v.number(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString()

    return await ctx.db.insert('ingestionRuns', {
      kind: 'daily_queue',
      status: args.queuedMunicipalities > 0 ? 'success' : 'skipped',
      startedAt: now,
      finishedAt: now,
      recordsRead: args.queuedMunicipalities,
      recordsWritten: args.queuedMunicipalities,
      message: args.message,
    })
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
    for (const place of args.places) {
      const existing = await ctx.db
        .query('stations')
        .withIndex('by_permit', (q) => q.eq('permitNumber', place.permitNumber))
        .unique()
      if (!existing) continue
      await ctx.db.patch(existing._id, {
        placeId: place.placeId,
        latitude: place.latitude,
        longitude: place.longitude,
        latBucket: latBucketFor(place.latitude),
        name: existing.name || place.name,
      })
      matched += 1
    }
    return { matched }
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
  handler: async (ctx, args): Promise<MunicipalityRefreshResult> => {
    return await refreshMunicipalityData(ctx, args.stateExternalId, args.municipalityExternalId)
  },
})

export const queueMunicipalityBatch = internalAction({
  args: {
    batch: v.array(
      v.object({
        stateExternalId: v.string(),
        municipalityExternalId: v.string(),
      }),
    ),
    staggerMs: v.number(),
  },
  handler: async (ctx, args) => {
    // Each `runAfter` is a system operation. With 800 municipalities per batch
    // we stay under Convex's 1000-op action limit and the outer queue action
    // only spends a handful of ops fanning out the batches.
    let delayMs = 0
    for (const m of args.batch) {
      await ctx.scheduler.runAfter(delayMs, internal.ingestion.refreshMunicipalityInternal, {
        stateExternalId: m.stateExternalId,
        municipalityExternalId: m.municipalityExternalId,
      })
      delayMs += args.staggerMs
    }
    return { queued: args.batch.length }
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
  args: {},
  handler: async (ctx): Promise<PlacesSnapshotResult> => {
    try {
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
      const allPlaces = parsePlaceRows(xml)

      // Fan out the matching: this action does the expensive fetch + regex
      // parse on 3.17 MB of XML, then schedules one mutation per 1000 places.
      // Each mutation does a single collect() of all stations and a join in
      // memory — the previous approach (one indexed lookup per place inside a
      // single mutation) blew the per-mutation op budget.
      const batchCount = Math.max(1, Math.ceil(allPlaces.length / PLACES_MATCH_CHUNK))
      for (let i = 0; i < allPlaces.length; i += PLACES_MATCH_CHUNK) {
        const slice = allPlaces.slice(i, i + PLACES_MATCH_CHUNK)
        const batchIndex = i / PLACES_MATCH_CHUNK
        await ctx.scheduler.runAfter(
          batchIndex * PLACES_BATCH_START_STAGGER_MS,
          internal.ingestion.matchPlacesBatch,
          { places: slice },
        )
      }

      const { runId } = await ctx.runMutation(internal.ingestion.recordPlacesRun, {
        sourceUrl: CNE_PLACES_URL,
        contentLength: xml.length,
        sample: xml.slice(0, 1800),
        placeCount: allPlaces.length,
        matched: 0, // filled in async by the batch actions
        message: `Snapshot XML validado. ${batchCount} lote(s) de matching encolados.`,
      })

      return { runId, places: allPlaces.length }
    } catch (error) {
      await ctx.runMutation(internal.ingestion.recordFailure, {
        kind: 'xml_snapshot',
        sourceUrl: CNE_PLACES_URL,
        message: error instanceof Error ? error.message : 'Places snapshot failed',
      })
      throw error
    }
  },
})

export const refreshPlaces = action({
  args: {},
  handler: async (ctx): Promise<PlacesSnapshotResult> => {
    return await ctx.runAction(internal.ingestion.capturePlacesSnapshot, {})
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
    // today's national queue hasn't already succeeded, so retries are no-ops
    // unless the primary run failed.
    const latest = await ctx.runQuery(internal.ingestion.latestDailyQueueRun, {})
    if (
      latest &&
      latest.status === 'success' &&
      isSameUtcDay(latest.startedAt, new Date())
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
    const queuedRecently = Number.isFinite(startedAt)
      ? Date.now() - startedAt < 30 * 60 * 1000
      : false

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
    })
  } catch (error) {
    await ctx.runMutation(internal.ingestion.recordFailure, {
      kind: 'municipality_prices',
      sourceUrl,
      stateExternalId,
      municipalityExternalId,
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
    await ctx.scheduler.runAfter(0, internal.ingestion.capturePlacesSnapshot, {})

    // Fan out across batches so the outer action stays under Convex's 1000
    // system-op limit. Each batch runs as its own action and re-staggers the
    // per-municipality refreshes so we don't hammer the CNE API.
    const totalMunicipalities = catalog.municipalities.length
    const batchCount = Math.max(1, Math.ceil(totalMunicipalities / MUNICIPALITY_BATCH_SIZE))
    for (let i = 0; i < totalMunicipalities; i += MUNICIPALITY_BATCH_SIZE) {
      const slice = catalog.municipalities.slice(i, i + MUNICIPALITY_BATCH_SIZE)
      const batch = slice.map((m) => ({
        stateExternalId: stateId(m.EntidadFederativaId),
        municipalityExternalId: municipalityId(m.MunicipioId),
      }))
      const batchIndex = i / MUNICIPALITY_BATCH_SIZE
      await ctx.scheduler.runAfter(
        batchIndex * MUNICIPALITY_BATCH_START_STAGGER_MS,
        internal.ingestion.queueMunicipalityBatch,
        { batch, staggerMs: MUNICIPALITY_REFRESH_STAGGER_MS },
      )
    }

    await ctx.runMutation(internal.ingestion.recordDailyQueue, {
      queuedMunicipalities: totalMunicipalities,
      message: `Carga nacional encolada para ${totalMunicipalities} municipios en ${batchCount} lote(s).`,
    })

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
      .filter((q) => q.eq(q.field('latitude'), undefined))
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
    await ctx.db.patch(args.stationId, {
      latitude: args.latitude,
      longitude: args.longitude,
      latBucket: latBucketFor(args.latitude),
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
        await sleep(NOMINATIM_MIN_INTERVAL_MS)
        continue
      }

      try {
        const hit = await geocodeWithNominatim(query)
        if (hit) {
          const latitude = Number(hit.lat)
          const longitude = Number(hit.lon)
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            await ctx.runMutation(internal.ingestion.patchStationCoordinates, {
              stationId: station._id,
              latitude,
              longitude,
            })
            geocoded += 1
          } else {
            failed += 1
          }
        } else {
          failed += 1
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
      await ctx.scheduler.runAfter(60_000, internal.ingestion.geocodeStationsInternal, {})
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

export const stationGeocodingStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('stations').collect()
    let withCoords = 0
    let withoutCoords = 0
    for (const station of all) {
      if (typeof station.latitude === 'number' && typeof station.longitude === 'number') {
        withCoords += 1
      } else {
        withoutCoords += 1
      }
    }
    return { total: all.length, withCoords, withoutCoords }
  },
})
