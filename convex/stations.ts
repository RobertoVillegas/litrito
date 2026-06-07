import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { internalMutation, query } from './_generated/server'
import type { QueryCtx, MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

const fuelType = v.union(
  v.literal('regular'),
  v.literal('premium'),
  v.literal('diesel'),
  v.literal('duba'),
  v.literal('unknown'),
)

const sortMode = v.union(
  v.literal('price'),
  v.literal('distance'),
  v.literal('name'),
)

const MEXICO_BOUNDS = {
  swLat: 14.5,
  swLon: -118.5,
  neLat: 32.7,
  neLon: -86.5,
}

export const listStations = query({
  args: {
    fuelTypes: v.optional(v.array(fuelType)),
    search: v.optional(v.string()),
    stateExternalIds: v.optional(v.array(v.string())),
    municipalityExternalIds: v.optional(v.array(v.string())),
    sortMode,
    userLocation: v.optional(
      v.object({ latitude: v.number(), longitude: v.number() }),
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const term = args.search?.trim() ?? ''
    const stateIds = args.stateExternalIds ?? []
    const muniIds = args.municipalityExternalIds ?? []
    const fuelTypes = args.fuelTypes ?? []

    const useSearch = term.length >= 2
    const singleState = stateIds.length === 1 ? stateIds[0] : null
    const singleMuni = muniIds.length === 1 ? muniIds[0] : null

    function parseOffset(cursor: string | null | undefined): number {
      if (!cursor) return 0
      const value = Number.parseInt(cursor.replace(/^\D+/, ''), 10)
      return Number.isFinite(value) && value >= 0 ? value : 0
    }

    let paginated: {
      page: Doc<'stations'>[]
      isDone: boolean
      continueCursor: string
    }
    if (useSearch) {
      let q = ctx.db
        .query('stations')
        .withSearchIndex('search_station', (sq) => {
          const search = sq.search('name', term)
          if (singleState && singleMuni) {
            return search
              .eq('stateExternalId', singleState)
              .eq('municipalityExternalId', singleMuni)
          }
          if (singleState) {
            return search.eq('stateExternalId', singleState)
          }
          return search
        })
      if (stateIds.length > 1) {
        q = q.filter((fq) =>
          fq.or(...stateIds.map((id) => fq.eq(fq.field('stateExternalId'), id))),
        )
      }
      const result = await q.paginate(args.paginationOpts)
      paginated = {
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      }
    } else if (muniIds.length > 0) {
      const allowedMunis = new Set(muniIds)
      const allowedStates = stateIds.length > 0 ? new Set(stateIds) : null
      const allStations = await ctx.db.query('stations').collect()
      const filtered = allStations.filter(
        (s) =>
          allowedMunis.has(s.municipalityExternalId) &&
          (allowedStates === null || allowedStates.has(s.stateExternalId)),
      )
      const start = parseOffset(args.paginationOpts.cursor)
      const end = start + args.paginationOpts.numItems
      const page = filtered.slice(start, end)
      const isDone = end >= filtered.length
      paginated = {
        page,
        isDone,
        continueCursor: isDone ? '' : `o:${end}`,
      }
    } else if (singleState) {
      const result = await ctx.db
        .query('stations')
        .withIndex('by_state', (q) => q.eq('stateExternalId', singleState))
        .paginate(args.paginationOpts)
      paginated = {
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      }
    } else if (stateIds.length > 1) {
      const allowed = new Set(stateIds)
      const all = await ctx.db.query('stations').collect()
      const filtered = all.filter((s) => allowed.has(s.stateExternalId))
      const start = parseOffset(args.paginationOpts.cursor)
      const end = start + args.paginationOpts.numItems
      const page = filtered.slice(start, end)
      const isDone = end >= filtered.length
      paginated = {
        page,
        isDone,
        continueCursor: isDone ? '' : `o:${end}`,
      }
    } else {
      const result = await ctx.db
        .query('stations')
        .withIndex('by_name', (q) => q)
        .paginate(args.paginationOpts)
      paginated = {
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      }
    }

    const stations = paginated.page
    const permitNumbers = stations.map((s) => s.permitNumber)

    const priceArrays = await Promise.all(
      permitNumbers.map((permit) =>
        ctx.db
          .query('fuelPricesCurrent')
          .withIndex('by_station_fuel', (q) =>
            q.eq('stationPermitNumber', permit),
          )
          .collect(),
      ),
    )
    const pricesByStation = new Map<string, Record<string, { price: number }>>()
    for (const arr of priceArrays) {
      for (const p of arr) {
        const slot = pricesByStation.get(p.stationPermitNumber) ?? {}
        slot[p.fuelType] = { price: p.price }
        pricesByStation.set(p.stationPermitNumber, slot)
      }
    }

    let rows = stations.map((station) => {
      const priceMap = pricesByStation.get(station.permitNumber) ?? {}
      const highlightedPrice =
        priceMap.regular?.price ??
        priceMap.premium?.price ??
        priceMap.diesel?.price ??
        priceMap.duba?.price ??
        priceMap.unknown?.price ??
        null
      return { station, prices: priceMap, highlightedPrice }
    })

    // Exclude a station from a fuel filter only when it reports prices but none
    // match the selected fuels. Stations with no reported price yet stay visible
    // so the catalog stays browsable while ingestion fills in.
    if (fuelTypes.length > 0) {
      rows = rows.filter((r) => {
        const hasAnyPrice = Object.keys(r.prices).length > 0
        if (!hasAnyPrice) return true
        return fuelTypes.some((ft) => r.prices[ft] != null)
      })
    }

    if (args.sortMode === 'price') {
      rows.sort((a, b) => {
        const ap = a.highlightedPrice ?? Number.POSITIVE_INFINITY
        const bp = b.highlightedPrice ?? Number.POSITIVE_INFINITY
        return ap - bp || a.station.name.localeCompare(b.station.name)
      })
    } else if (args.sortMode === 'name') {
      rows.sort((a, b) => a.station.name.localeCompare(b.station.name))
    } else if (args.sortMode === 'distance' && args.userLocation) {
      const ul = args.userLocation
      const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const toRad = (d: number) => (d * Math.PI) / 180
        const R = 6371
        const dLat = toRad(lat2 - lat1)
        const dLon = toRad(lon2 - lon1)
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
        return 2 * R * Math.asin(Math.sqrt(a))
      }
      rows.sort((a, b) => {
        const aLat = a.station.latitude
        const aLon = a.station.longitude
        const bLat = b.station.latitude
        const bLon = b.station.longitude
        if (typeof aLat !== 'number' || typeof aLon !== 'number') return 1
        if (typeof bLat !== 'number' || typeof bLon !== 'number') return -1
        const da = haversine(ul.latitude, ul.longitude, aLat, aLon)
        const db = haversine(ul.latitude, ul.longitude, bLat, bLon)
        return da - db
      })
    }

    return {
      ...paginated,
      page: rows,
    }
  },
})

export const listStationsInBounds = query({
  args: {
    fuelTypes: v.optional(v.array(fuelType)),
    swLat: v.number(),
    swLon: v.number(),
    neLat: v.number(),
    neLon: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 800, 800)
    const swLat = Math.max(args.swLat, MEXICO_BOUNDS.swLat)
    const neLat = Math.min(args.neLat, MEXICO_BOUNDS.neLat)
    const swLon = Math.max(args.swLon, MEXICO_BOUNDS.swLon)
    const neLon = Math.min(args.neLon, MEXICO_BOUNDS.neLon)

    if (swLat > neLat || swLon > neLon) {
      return { stations: [], truncated: false }
    }

    const candidates = await ctx.db
      .query('stations')
      .withIndex('by_lat', (q) =>
        q.gte('latitude', swLat).lte('latitude', neLat),
      )
      .collect()

    const fuelTypes = args.fuelTypes ?? []
    const inBounds = candidates.filter((s) => {
      const lat = s.latitude
      const lon = s.longitude
      if (typeof lat !== 'number' || typeof lon !== 'number') return false
      if (lon < swLon || lon > neLon) return false
      return true
    })

    // Cap the result set before looking up prices: a national view can hold
    // ~13k stations and one price query per station would blow past Convex's
    // per-query read limit.
    const truncated = inBounds.length > limit
    const selected = truncated ? inBounds.slice(0, limit) : inBounds

    const prices = await Promise.all(
      selected.map((s) =>
        ctx.db
          .query('fuelPricesCurrent')
          .withIndex('by_station_fuel', (q) =>
            q.eq('stationPermitNumber', s.permitNumber),
          )
          .collect(),
      ),
    )
    const pricesByStation = new Map<string, Record<string, { price: number }>>()
    for (const arr of prices) {
      for (const p of arr) {
        const slot = pricesByStation.get(p.stationPermitNumber) ?? {}
        slot[p.fuelType] = { price: p.price }
        pricesByStation.set(p.stationPermitNumber, slot)
      }
    }

    const projected = selected
      .map((station) => {
        const priceMap = pricesByStation.get(station.permitNumber) ?? {}
        const highlightedPrice =
          priceMap.regular?.price ??
          priceMap.premium?.price ??
          priceMap.diesel?.price ??
          priceMap.duba?.price ??
          priceMap.unknown?.price ??
          null
        return { station, prices: priceMap, highlightedPrice }
      })
      .filter((r) => {
        if (fuelTypes.length === 0) return true
        const hasAnyPrice = Object.keys(r.prices).length > 0
        if (!hasAnyPrice) return true
        return fuelTypes.some((ft) => r.prices[ft] != null)
      })

    return { stations: projected, truncated }
  },
})

export const getStationDetail = query({
  args: { permitNumber: v.string() },
  handler: async (ctx, args) => {
    const station = await ctx.db
      .query('stations')
      .withIndex('by_permit', (q) => q.eq('permitNumber', args.permitNumber))
      .unique()

    if (!station) return null

    const [currentPrices, history] = await Promise.all([
      ctx.db
        .query('fuelPricesCurrent')
        .withIndex('by_station_fuel', (q) =>
          q.eq('stationPermitNumber', args.permitNumber),
        )
        .collect(),
      ctx.db
        .query('fuelPricesHistory')
        .withIndex('by_station', (q) =>
          q.eq('stationPermitNumber', args.permitNumber),
        )
        .order('desc')
        .take(120),
    ])

    return {
      station,
      currentPrices: Object.fromEntries(
        currentPrices.map((p) => [p.fuelType, { price: p.price, reportedAt: p.reportedAt }]),
      ),
      history: history.map((h) => ({
        fuelType: h.fuelType,
        price: h.price,
        reportedAt: h.reportedAt,
        ingestedAt: h.ingestedAt,
      })),
    }
  },
})

type FilterOptionsPayload = {
  states: { externalId: string; name: string; count: number }[]
  municipalities: {
    externalId: string
    stateExternalId: string
    name: string
    count: number
  }[]
}

const FILTER_OPTIONS_CACHE_KEY = 'default'

// Scans the full catalog to build the state/municipality filter lists with
// station counts. Used both by the live query (fallback) and the cache builder.
async function computeFilterOptions(
  ctx: QueryCtx | MutationCtx,
): Promise<FilterOptionsPayload> {
  const [states, municipalities, stations] = await Promise.all([
    ctx.db.query('states').collect(),
    ctx.db.query('municipalities').collect(),
    ctx.db.query('stations').collect(),
  ])

  const stationsByState = new Map<string, number>()
  const stationsByMuni = new Map<string, number>()
  for (const s of stations) {
    stationsByState.set(
      s.stateExternalId,
      (stationsByState.get(s.stateExternalId) ?? 0) + 1,
    )
    const muniKey = `${s.stateExternalId}|${s.municipalityExternalId}`
    stationsByMuni.set(muniKey, (stationsByMuni.get(muniKey) ?? 0) + 1)
  }

  return {
    states: states
      .map((s) => ({
        externalId: s.externalId,
        name: s.name,
        count: stationsByState.get(s.externalId) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    municipalities: municipalities
      .map((m) => ({
        externalId: m.externalId,
        stateExternalId: m.stateExternalId,
        name: m.name,
        count: stationsByMuni.get(`${m.stateExternalId}|${m.externalId}`) ?? 0,
      }))
      .filter((m) => m.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export const listFilterOptions = query({
  args: {},
  handler: async (ctx): Promise<FilterOptionsPayload> => {
    // Serve the precomputed snapshot when present; scanning the whole catalog
    // on every page load is what burns read I/O. Fall back to a live compute
    // until the cache has been built at least once.
    const cached = await ctx.db
      .query('filterOptionsCache')
      .withIndex('by_key', (q) => q.eq('key', FILTER_OPTIONS_CACHE_KEY))
      .unique()
    if (cached) {
      return JSON.parse(cached.data) as FilterOptionsPayload
    }
    return await computeFilterOptions(ctx)
  },
})

export const rebuildFilterOptionsCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const payload = await computeFilterOptions(ctx)
    const value = {
      key: FILTER_OPTIONS_CACHE_KEY,
      data: JSON.stringify(payload),
      updatedAt: new Date().toISOString(),
    }
    const existing = await ctx.db
      .query('filterOptionsCache')
      .withIndex('by_key', (q) => q.eq('key', FILTER_OPTIONS_CACHE_KEY))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, value)
    } else {
      await ctx.db.insert('filterOptionsCache', value)
    }
    return {
      states: payload.states.length,
      municipalities: payload.municipalities.length,
    }
  },
})

// Paginated export: a single query can't read all ~13k stations plus their
// prices without exceeding Convex's per-execution read limit, so callers page
// through with the returned cursor (see http.ts /stations/export).
export const exportStationsPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query('stations')
      .withIndex('by_name', (q) => q)
      .paginate(args.paginationOpts)

    const priceArrays = await Promise.all(
      result.page.map((s) =>
        ctx.db
          .query('fuelPricesCurrent')
          .withIndex('by_station_fuel', (q) =>
            q.eq('stationPermitNumber', s.permitNumber),
          )
          .collect(),
      ),
    )

    const stations = result.page.map((s, i) => {
      const priceMap: Record<string, { price: number; reportedAt: string | null }> = {}
      for (const p of priceArrays[i]) {
        priceMap[p.fuelType] = { price: p.price, reportedAt: p.reportedAt ?? null }
      }
      return {
        permitNumber: s.permitNumber,
        name: s.name,
        address: s.address,
        stateExternalId: s.stateExternalId,
        municipalityExternalId: s.municipalityExternalId,
        stateName: s.stateName,
        municipalityName: s.municipalityName,
        latitude: s.latitude ?? null,
        longitude: s.longitude ?? null,
        source: s.source,
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
        prices: priceMap,
      }
    })

    return {
      stations,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})
