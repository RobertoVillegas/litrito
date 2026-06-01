import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  type ActionCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import {
  municipalityId,
  normalizeFuelType,
  normalizeText,
  stateId,
  type FuelType,
} from './normalization'

const CNE_CATALOG_URL = 'https://api-catalogo.cne.gob.mx/api/utiles'
const CNE_REPORT_URL = 'https://api-reportediario.cne.gob.mx/api/EstacionServicio/Petroliferos'
const CNE_XML_URL = 'https://publicacionexterna.azurewebsites.net/publicaciones/prices'

type CneState = {
  EntidadFederativaId: string | number
  Nombre: string
}

type CneMunicipality = {
  MunicipioId: string | number
  EntidadFederativaId: string | number
  Nombre: string
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Litrito/0.1 (+https://cne.gob.mx)',
    },
  })

  if (!response.ok) {
    throw new Error(`CNE request failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function fetchCatalog() {
  const states = await fetchJson<CneState[]>(`${CNE_CATALOG_URL}/entidadesfederativas`)
  const municipalities: CneMunicipality[] = []

  for (const state of states) {
    const stateExternalId = stateId(state.EntidadFederativaId)
    const stateMunicipalities = await fetchJson<CneMunicipality[]>(
      `${CNE_CATALOG_URL}/municipios?EntidadFederativaId=${stateExternalId}`,
    )
    municipalities.push(...stateMunicipalities)
  }

  return { states, municipalities }
}

function normalizePriceRows(rows: CnePrice[]): MunicipalityPrice[] {
  const seen = new Set<string>()
  const validRows: MunicipalityPrice[] = []

  for (const row of rows) {
    const price = Number(row.PrecioVigente)
    const permitNumber = normalizeText(row.Numero)
    const product = normalizeText(row.Producto)
    const subproduct = normalizeText(row.SubProducto)
    const stateExternalId = stateId(row.EntidadFederativaId)
    const municipalityExternalId = municipalityId(row.MunicipioId)
    const fuel = normalizeFuelType(product, subproduct)
    const duplicateKey = `${permitNumber}:${fuel}:${price}`

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

  return validRows
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

    for (const state of args.states) {
      const externalId = stateId(state.EntidadFederativaId)
      const existing = await ctx.db
        .query('states')
        .withIndex('by_external_id', (q) => q.eq('externalId', externalId))
        .unique()

      const value = { externalId, name: normalizeText(state.Nombre), updatedAt }
      if (existing) {
        await ctx.db.patch(existing._id, value)
      } else {
        await ctx.db.insert('states', value)
      }
    }

    for (const municipality of args.municipalities) {
      const externalId = municipalityId(municipality.MunicipioId)
      const stateExternalId = stateId(municipality.EntidadFederativaId)
      const existing = await ctx.db
        .query('municipalities')
        .withIndex('by_external_id', (q) =>
          q.eq('stateExternalId', stateExternalId).eq('externalId', externalId),
        )
        .unique()

      const value = {
        externalId,
        stateExternalId,
        name: normalizeText(municipality.Nombre),
        updatedAt,
      }

      if (existing) {
        await ctx.db.patch(existing._id, value)
      } else {
        await ctx.db.insert('municipalities', value)
      }
    }

    return { states: args.states.length, municipalities: args.municipalities.length }
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
        fuelType: v.union(
          v.literal('regular'),
          v.literal('premium'),
          v.literal('diesel'),
          v.literal('duba'),
          v.literal('unknown'),
        ),
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

    let recordsWritten = 0
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

      for (const currentPrice of currentPrices) {
        await ctx.db.delete(currentPrice._id)
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

      await ctx.db.insert('fuelPricesCurrent', priceValue)
      await ctx.db.insert('fuelPricesHistory', { ...priceValue, runId })
      recordsWritten += 1
    }

    await ctx.db.patch(runId, {
      status: recordsWritten > 0 ? 'success' : 'skipped',
      finishedAt: new Date().toISOString(),
      recordsWritten,
      message:
        recordsWritten > 0
          ? `Se actualizaron ${recordsWritten} precios.`
          : 'La fuente no regreso precios validos para este municipio.',
    })

    return { runId, recordsWritten }
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

export const recordXmlSnapshot = internalMutation({
  args: {
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
        kind: 'cne_prices_xml',
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

export const refreshCatalog = action({
  args: {},
  handler: async (ctx) => {
    try {
      const catalog = await fetchCatalog()
      return await ctx.runMutation(internal.ingestion.applyCatalog, catalog)
    } catch (error) {
      await ctx.runMutation(internal.ingestion.recordFailure, {
        kind: 'catalog',
        message: error instanceof Error ? error.message : 'Catalog refresh failed',
      })
      throw error
    }
  },
})

export const refreshMunicipality = action({
  args: {
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
  },
  handler: async (ctx, args) => {
    return await refreshMunicipalityData(ctx, args.stateExternalId, args.municipalityExternalId)
  },
})

export const refreshMunicipalityInternal = internalAction({
  args: {
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
  },
  handler: async (ctx, args) => {
    return await refreshMunicipalityData(ctx, args.stateExternalId, args.municipalityExternalId)
  },
})

export const captureXmlSnapshot = internalAction({
  args: {},
  handler: async (ctx) => {
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

export const queueDailyRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const catalog = await fetchCatalog()
      await ctx.runMutation(internal.ingestion.applyCatalog, catalog)
      await ctx.scheduler.runAfter(0, internal.ingestion.captureXmlSnapshot, {})

      let delayMs = 0
      for (const municipality of catalog.municipalities) {
        await ctx.scheduler.runAfter(delayMs, internal.ingestion.refreshMunicipalityInternal, {
          stateExternalId: stateId(municipality.EntidadFederativaId),
          municipalityExternalId: municipalityId(municipality.MunicipioId),
        })
        delayMs += 750
      }

      return {
        queuedMunicipalities: catalog.municipalities.length,
      }
    } catch (error) {
      await ctx.runMutation(internal.ingestion.recordFailure, {
        kind: 'daily_queue',
        message: error instanceof Error ? error.message : 'Daily refresh queue failed',
      })
      throw error
    }
  },
})

async function refreshMunicipalityData(
  ctx: ActionCtx,
  rawStateExternalId: string,
  rawMunicipalityExternalId: string,
) {
  const stateExternalId = stateId(rawStateExternalId)
  const municipalityExternalId = municipalityId(rawMunicipalityExternalId)
  const sourceUrl = `${CNE_REPORT_URL}?entidadId=${stateExternalId}&municipioId=${municipalityExternalId}`

  try {
    const response = await fetchJson<{ Success: boolean; Errors: unknown; Value: CnePrice[] }>(
      sourceUrl,
    )

    if (!response.Success) {
      throw new Error(`CNE report error: ${String(response.Errors ?? 'unknown error')}`)
    }

    return await ctx.runMutation(internal.ingestion.applyMunicipalityPrices, {
      stateExternalId,
      municipalityExternalId,
      sourceUrl,
      records: normalizePriceRows(response.Value ?? []),
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
