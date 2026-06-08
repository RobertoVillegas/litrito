import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server'
import type { QueryCtx, MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'

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

// Hard cap on how many station docs the bounds scan will read before giving
// up and returning a truncated result. The common case (national or city
// zoom) fills `limit` long before this. The cap protects the per-query read
// budget against a pathological viewport — e.g. a tall, thin vertical strip
// where the lat band spans the country but the lon filter rejects almost
// everything, so we'd otherwise iterate every station to find a handful.
const MAX_STATION_SCAN = 4000

// Cap on stations sampled for a national (no state/muni filter) distance sort.
// ~4k docs is well under the 32k-doc / 16MB per-query limits, and the true
// nearest stations fall inside this latitude-centered window.
const DISTANCE_SCAN_CAP = 4000

// N+1 price lookups, throttled to this many in flight at a time. Convex
// queries have a per-call parallel-read ceiling (self-hosted is more
// aggressive than cloud), so 800 simultaneous indexed reads get killed with
// 'too many system operations'. Small parallel batches keep the in-flight
// count well under the cap while still finishing an 800-station view quickly.
const PRICE_LOOKUP_CHUNK = 16

type FuelType = Doc<'fuelPricesCurrent'>['fuelType']
type ParsedMunicipality = { state: string | null; muni: string }
type StationRow = {
  station: Doc<'stations'>
  prices: Record<string, { price: number }>
  highlightedPrice: number | null
  distanceKm?: number | null
}

function parseOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0
  const value = Number.parseInt(cursor.replace(/^\D+/, ''), 10)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function paginateArray<T>(
  rows: T[],
  cursor: string | null,
  numItems: number,
): { page: T[]; isDone: boolean; continueCursor: string } {
  const start = parseOffset(cursor)
  const end = start + numItems
  const page = rows.slice(start, end)
  const isDone = end >= rows.length
  return { page, isDone, continueCursor: isDone ? '' : `o:${end}` }
}

function stationMatchesSelections(
  station: Doc<'stations'>,
  stateIds: string[],
  parsedMunis: ParsedMunicipality[],
): boolean {
  if (parsedMunis.length > 0) {
    const muniKeys = new Set(
      parsedMunis
        .filter((p) => p.state)
        .map((p) => `${p.state}|${p.muni}`),
    )
    const rawMunis = new Set(
      parsedMunis.filter((p) => !p.state).map((p) => p.muni),
    )
    const allowedStates = stateIds.length > 0 ? new Set(stateIds) : null
    const matchesComposite = muniKeys.has(
      `${station.stateExternalId}|${station.municipalityExternalId}`,
    )
    const matchesRaw =
      rawMunis.has(station.municipalityExternalId) &&
      (allowedStates === null || allowedStates.has(station.stateExternalId))
    return matchesComposite || matchesRaw
  }
  if (stateIds.length > 0) return stateIds.includes(station.stateExternalId)
  return true
}

function priceMatchesSelections(
  price: Doc<'fuelPricesCurrent'>,
  stateIds: string[],
  parsedMunis: ParsedMunicipality[],
): boolean {
  if (parsedMunis.length > 0) {
    const muniKeys = new Set(
      parsedMunis
        .filter((p) => p.state)
        .map((p) => `${p.state}|${p.muni}`),
    )
    const rawMunis = new Set(
      parsedMunis.filter((p) => !p.state).map((p) => p.muni),
    )
    const allowedStates = stateIds.length > 0 ? new Set(stateIds) : null
    const matchesComposite = muniKeys.has(
      `${price.stateExternalId}|${price.municipalityExternalId}`,
    )
    const matchesRaw =
      rawMunis.has(price.municipalityExternalId) &&
      (allowedStates === null || allowedStates.has(price.stateExternalId))
    return matchesComposite || matchesRaw
  }
  if (stateIds.length > 0) return stateIds.includes(price.stateExternalId)
  return true
}

function pickHighlightedPrice(
  priceMap: Record<string, { price: number }>,
  fuelTypes: FuelType[],
) {
  for (const ft of fuelTypes) {
    const price = priceMap[ft]?.price
    if (price != null) return price
  }
  return (
    priceMap.regular?.price ??
    priceMap.premium?.price ??
    priceMap.diesel?.price ??
    priceMap.duba?.price ??
    priceMap.unknown?.price ??
    null
  )
}

async function hydrateStationRows(
  ctx: QueryCtx,
  stations: Doc<'stations'>[],
  fuelTypes: FuelType[],
): Promise<StationRow[]> {
  const priceArrays = await Promise.all(
    stations.map((station) =>
      ctx.db
        .query('fuelPricesCurrent')
        .withIndex('by_station_fuel', (q) =>
          q.eq('stationPermitNumber', station.permitNumber),
        )
        .collect(),
    ),
  )

  return stations.map((station, i) => {
    const priceMap: Record<string, { price: number }> = {}
    for (const p of priceArrays[i]) {
      priceMap[p.fuelType] = { price: p.price }
    }
    return {
      station,
      prices: priceMap,
      highlightedPrice: pickHighlightedPrice(priceMap, fuelTypes),
      distanceKm: null,
    }
  })
}

function filterRowsByFuel(rows: StationRow[], fuelTypes: FuelType[]) {
  if (fuelTypes.length === 0) return rows
  return rows.filter((r) => {
    const hasAnyPrice = Object.keys(r.prices).length > 0
    if (!hasAnyPrice) return true
    return fuelTypes.some((ft) => r.prices[ft] != null)
  })
}

const toRad = (d: number) => (d * Math.PI) / 180
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function listStationsByPrice(
  ctx: QueryCtx,
  params: {
    fuelTypes: FuelType[]
    stateIds: string[]
    parsedMunis: ParsedMunicipality[]
    singleState: string | null
    singleMuni: ParsedMunicipality | null
    paginationOpts: { cursor: string | null; numItems: number }
  },
): Promise<{ page: StationRow[]; isDone: boolean; continueCursor: string }> {
  const primaryFuel = params.fuelTypes[0] ?? 'regular'
  const locationScopedMuni =
    params.singleState && params.singleMuni
      ? { state: params.singleState, muni: params.singleMuni.muni }
      : null

  const stateScoped = params.singleState
  const priceDocs = locationScopedMuni
    ? await ctx.db
        .query('fuelPricesCurrent')
        .withIndex('by_location_fuel_price', (q) =>
          q
            .eq('stateExternalId', locationScopedMuni.state)
            .eq('municipalityExternalId', locationScopedMuni.muni)
            .eq('fuelType', primaryFuel),
        )
        .collect()
    : stateScoped && params.stateIds.length <= 1
      ? await ctx.db
          .query('fuelPricesCurrent')
          .withIndex('by_state_fuel_price', (q) =>
            q.eq('stateExternalId', stateScoped).eq('fuelType', primaryFuel),
          )
          .collect()
      : await ctx.db
          .query('fuelPricesCurrent')
          .withIndex('by_fuel_price', (q) => q.eq('fuelType', primaryFuel))
          .collect()

  const seenPermits = new Set<string>()
  const orderedPrices = priceDocs.filter((price) => {
    if (!priceMatchesSelections(price, params.stateIds, params.parsedMunis)) {
      return false
    }
    if (seenPermits.has(price.stationPermitNumber)) return false
    seenPermits.add(price.stationPermitNumber)
    return true
  })

  const pagePrices = paginateArray(
    orderedPrices,
    params.paginationOpts.cursor,
    params.paginationOpts.numItems,
  )
  const stations = (
    await Promise.all(
      pagePrices.page.map((price) =>
        ctx.db
          .query('stations')
          .withIndex('by_permit', (q) =>
            q.eq('permitNumber', price.stationPermitNumber),
          )
          .unique(),
      ),
    )
  ).filter((station): station is Doc<'stations'> => station !== null)

  const rows = await hydrateStationRows(ctx, stations, params.fuelTypes)
  return {
    ...pagePrices,
    page: rows,
  }
}

// Read at most `limit` docs from an async-iterable query. Async iteration is
// lazy, so this never reads the whole table — unlike `.collect()`.
async function collectUpTo<T>(
  iterable: AsyncIterable<T>,
  limit: number,
): Promise<T[]> {
  const out: T[] = []
  for await (const doc of iterable) {
    out.push(doc)
    if (out.length >= limit) break
  }
  return out
}

// Candidate stations for a state/municipality selection, read straight from the
// most selective index (one state is ~600-1500 docs) instead of scanning the
// whole catalog by latitude.
async function loadStationsForSelections(
  ctx: QueryCtx,
  stateIds: string[],
  parsedMunis: ParsedMunicipality[],
): Promise<Doc<'stations'>[]> {
  const out: Doc<'stations'>[] = []
  const seen = new Set<string>()
  const push = (rows: Doc<'stations'>[]) => {
    for (const s of rows) {
      if (seen.has(s.permitNumber)) continue
      seen.add(s.permitNumber)
      out.push(s)
    }
  }

  const munisWithState = parsedMunis.filter((m) => m.state)
  if (munisWithState.length > 0) {
    for (const m of munisWithState) {
      push(
        await ctx.db
          .query('stations')
          .withIndex('by_location', (q) =>
            q
              .eq('stateExternalId', m.state as string)
              .eq('municipalityExternalId', m.muni),
          )
          .collect(),
      )
    }
  } else if (stateIds.length > 0) {
    for (const sid of stateIds) {
      push(
        await ctx.db
          .query('stations')
          .withIndex('by_state', (q) => q.eq('stateExternalId', sid))
          .collect(),
      )
    }
  }
  return out
}

// National distance sort: read the stations nearest to the user's latitude by
// walking the `by_lat` index outward in both directions, capped at
// DISTANCE_SCAN_CAP total. True nearest-by-distance stations sit within a small
// latitude band of the user, so this bounded sample contains them while keeping
// reads far under the per-query document/byte limits. The previous nested
// radius `.collect()` loop re-read overlapping latitude bands and blew the
// 32k-doc / 16MB limit once the catalog filled up.
async function loadNearestByLatitude(
  ctx: QueryCtx,
  userLat: number,
  cap: number,
): Promise<Doc<'stations'>[]> {
  const half = Math.ceil(cap / 2)
  const north = await collectUpTo(
    ctx.db
      .query('stations')
      .withIndex('by_lat', (q) => q.gte('latitude', userLat)),
    half,
  )
  const south = await collectUpTo(
    ctx.db
      .query('stations')
      .withIndex('by_lat', (q) => q.lt('latitude', userLat))
      .order('desc'),
    half,
  )
  return [...north, ...south]
}

async function listStationsByDistance(
  ctx: QueryCtx,
  params: {
    fuelTypes: FuelType[]
    stateIds: string[]
    parsedMunis: ParsedMunicipality[]
    userLocation: { latitude: number; longitude: number }
    paginationOpts: { cursor: string | null; numItems: number }
  },
): Promise<{ page: StationRow[]; isDone: boolean; continueCursor: string }> {
  const hasIndexedSelection =
    params.parsedMunis.some((m) => m.state) || params.stateIds.length > 0

  const candidates = hasIndexedSelection
    ? await loadStationsForSelections(ctx, params.stateIds, params.parsedMunis)
    : await loadNearestByLatitude(
        ctx,
        params.userLocation.latitude,
        DISTANCE_SCAN_CAP,
      )

  const sorted = candidates
    .filter((station) =>
      stationMatchesSelections(station, params.stateIds, params.parsedMunis),
    )
    .map((station) => ({
      station,
      distanceKm: haversineKm(
        params.userLocation.latitude,
        params.userLocation.longitude,
        station.latitude ?? 0,
        station.longitude ?? 0,
      ),
    }))
    .sort((a, b) => {
      return a.distanceKm - b.distanceKm || a.station.name.localeCompare(b.station.name)
    })

  const page = paginateArray(
    sorted,
    params.paginationOpts.cursor,
    params.paginationOpts.numItems,
  )
  const distanceByPermit = new Map(
    page.page.map((item) => [item.station.permitNumber, item.distanceKm]),
  )
  const rows = filterRowsByFuel(
    await hydrateStationRows(
      ctx,
      page.page.map((item) => item.station),
      params.fuelTypes,
    ),
    params.fuelTypes,
  ).map((row) => ({
    ...row,
    distanceKm: distanceByPermit.get(row.station.permitNumber) ?? null,
  }))

  return { ...page, page: rows }
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

    // The UI sends municipality ids as "stateExternalId|municipalityExternalId"
    // because municipality ids are only unique within a state. Accept a bare id
    // too for backward compatibility.
    const parsedMunis = muniIds.map((id) => {
      const sep = id.indexOf('|')
      return sep >= 0
        ? { state: id.slice(0, sep), muni: id.slice(sep + 1) }
        : { state: null as string | null, muni: id }
    })

    const useSearch = term.length >= 2
    const singleStateFromState = stateIds.length === 1 ? stateIds[0] : null
    const singleMuni = parsedMunis.length === 1 ? parsedMunis[0] : null
    // For a single selected municipality, take the state from its composite key.
    const singleState = singleStateFromState ?? singleMuni?.state ?? null

    if (!useSearch && args.sortMode === 'distance' && args.userLocation) {
      return await listStationsByDistance(ctx, {
        fuelTypes,
        stateIds,
        parsedMunis,
        userLocation: args.userLocation,
        paginationOpts: args.paginationOpts,
      })
    }

    if (!useSearch && args.sortMode === 'price') {
      return await listStationsByPrice(ctx, {
        fuelTypes,
        stateIds,
        parsedMunis,
        singleState,
        singleMuni,
        paginationOpts: args.paginationOpts,
      })
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
              .eq('municipalityExternalId', singleMuni.muni)
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
    } else if (parsedMunis.length > 0) {
      // Read only the selected municipalities/states via index instead of
      // scanning the whole catalog, then narrow with the shared matcher.
      const filtered = (
        await loadStationsForSelections(ctx, stateIds, parsedMunis)
      ).filter((s) => stationMatchesSelections(s, stateIds, parsedMunis))
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
      // Read the selected states via the by_state index rather than the whole
      // catalog.
      const filtered = await loadStationsForSelections(ctx, stateIds, [])
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

    let rows = await hydrateStationRows(ctx, paginated.page, fuelTypes)

    // Exclude a station from a fuel filter only when it reports prices but none
    // match the selected fuels. Stations with no reported price yet stay visible
    // so the catalog stays browsable while ingestion fills in.
    rows = filterRowsByFuel(rows, fuelTypes)

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
      const distanceForRow = (row: StationRow) => {
        const lat = row.station.latitude
        const lon = row.station.longitude
        if (typeof lat !== 'number' || typeof lon !== 'number') return null
        return haversineKm(ul.latitude, ul.longitude, lat, lon)
      }
      rows = rows.map((row) => ({
        ...row,
        distanceKm: distanceForRow(row),
      }))
      rows.sort((a, b) => {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY
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

    const fuelTypes = args.fuelTypes ?? []

    // Stream the by_lat index and stop as soon as we have enough so a national
    // view doesn't read all 8k+ stations at once. We must NOT use `.paginate()`
    // here: Convex allows only one paginated query per function and a
    // server-side pagination loop calls it repeatedly, which the backend
    // rejects with "ran multiple paginated queries". Async iteration reads
    // lazily and lets us break early without any pagination call. The previous
    // `.collect()` version pulled every station in the lat range and timed out
    // the self-hosted op budget once the catalog filled up.
    const selected: Doc<'stations'>[] = []
    let truncated = false
    let scanned = 0

    for await (const station of ctx.db
      .query('stations')
      .withIndex('by_lat', (q) =>
        q.gte('latitude', swLat).lte('latitude', neLat),
      )) {
      scanned++
      const lat = station.latitude
      const lon = station.longitude
      if (
        typeof lat === 'number' &&
        typeof lon === 'number' &&
        lon >= swLon &&
        lon <= neLon
      ) {
        selected.push(station)
        if (selected.length >= limit) {
          truncated = true
          break
        }
      }
      if (scanned >= MAX_STATION_SCAN) {
        truncated = true
        break
      }
    }

    // N+1 price lookups, throttled to PRICE_LOOKUP_CHUNK in flight at a time.
    // Convex queries have a per-call parallel-read ceiling (and self-hosted
    // is more aggressive about it than cloud), so 800 simultaneous indexed
    // reads will be killed with 'too many system operations'. Doing 16
    // parallel reads per turn keeps the in-flight count well under the cap
    // while still finishing a 800-station view in ~50 sequential turns.
    const pricesByStation = new Map<string, Record<string, { price: number }>>()
    for (let i = 0; i < selected.length; i += PRICE_LOOKUP_CHUNK) {
      const batch = selected.slice(i, i + PRICE_LOOKUP_CHUNK)
      const priceArrays = await Promise.all(
        batch.map((s) =>
          ctx.db
            .query('fuelPricesCurrent')
            .withIndex('by_station_fuel', (q) =>
              q.eq('stationPermitNumber', s.permitNumber),
            )
            .collect(),
        ),
      )
      for (const arr of priceArrays) {
        for (const p of arr) {
          const slot = pricesByStation.get(p.stationPermitNumber) ?? {}
          slot[p.fuelType] = { price: p.price }
          pricesByStation.set(p.stationPermitNumber, slot)
        }
      }
    }

    const pickHighlightedPrice = (priceMap: Record<string, { price: number }>) => {
      for (const ft of fuelTypes) {
        const price = priceMap[ft]?.price
        if (price != null) return price
      }
      return (
        priceMap.regular?.price ??
        priceMap.premium?.price ??
        priceMap.diesel?.price ??
        priceMap.duba?.price ??
        priceMap.unknown?.price ??
        null
      )
    }

    const projected = selected
      .map((station) => {
        const priceMap = pricesByStation.get(station.permitNumber) ?? {}
        const highlightedPrice = pickHighlightedPrice(priceMap)
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

// Resolve a set of permit numbers (e.g. the user's favorites) to station rows
// with current prices, in the same shape the home table consumes.
export const getStationsByPermits = query({
  args: { permitNumbers: v.array(v.string()) },
  handler: async (ctx, args) => {
    const permits = args.permitNumbers.slice(0, 200)
    const rows = await Promise.all(
      permits.map(async (permit) => {
        const station = await ctx.db
          .query('stations')
          .withIndex('by_permit', (q) => q.eq('permitNumber', permit))
          .unique()
        if (!station) return null
        const prices = await ctx.db
          .query('fuelPricesCurrent')
          .withIndex('by_station_fuel', (q) => q.eq('stationPermitNumber', permit))
          .collect()
        const priceMap: Record<string, { price: number }> = {}
        for (const p of prices) priceMap[p.fuelType] = { price: p.price }
        const highlightedPrice =
          priceMap.regular?.price ??
          priceMap.premium?.price ??
          priceMap.diesel?.price ??
          priceMap.duba?.price ??
          priceMap.unknown?.price ??
          null
        return { station, prices: priceMap, highlightedPrice }
      }),
    )
    return rows.filter((r): r is NonNullable<typeof r> => r !== null)
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
  const states = await ctx.db.query('states').collect()
  const stations = await ctx.db.query('stations').collect()

  // Walk municipalities one state at a time. A single
  // `db.query('municipalities').collect()` would read all ~2,500 rows in one
  // shot, which trips the self-hosted backend's per-mutation system-op cap
  // when combined with the parallel stations collect.
  const municipalities: Doc<'municipalities'>[] = []
  for (const state of states) {
    const chunk = await ctx.db
      .query('municipalities')
      .withIndex('by_state', (q) => q.eq('stateExternalId', state.externalId))
      .collect()
    for (const m of chunk) municipalities.push(m)
  }

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

// Per-state slice of the filter options. Reading one state's stations and
// municipalities stays well under the per-transaction op budget (a single
// `stations.collect()` over the whole catalog does not — that is why the old
// single-mutation rebuild timed out and the cache was stuck on a stale,
// early-development payload).
export const filterOptionsForState = internalQuery({
  args: { stateExternalId: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query('states')
      .withIndex('by_external_id', (q) => q.eq('externalId', args.stateExternalId))
      .unique()
    if (!state) return null

    const stations = await ctx.db
      .query('stations')
      .withIndex('by_state', (q) => q.eq('stateExternalId', args.stateExternalId))
      .collect()
    const municipalities = await ctx.db
      .query('municipalities')
      .withIndex('by_state', (q) => q.eq('stateExternalId', args.stateExternalId))
      .collect()

    const byMuni = new Map<string, number>()
    for (const s of stations) {
      byMuni.set(
        s.municipalityExternalId,
        (byMuni.get(s.municipalityExternalId) ?? 0) + 1,
      )
    }

    return {
      state: {
        externalId: state.externalId,
        name: state.name,
        count: stations.length,
      },
      municipalities: municipalities
        .map((m) => ({
          externalId: m.externalId,
          stateExternalId: m.stateExternalId,
          name: m.name,
          count: byMuni.get(m.externalId) ?? 0,
        }))
        .filter((m) => m.count > 0),
    }
  },
})

export const listStateExternalIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const states = await ctx.db.query('states').collect()
    return states.map((s) => s.externalId)
  },
})

export const writeFilterOptionsCache = internalMutation({
  args: { data: v.string() },
  handler: async (ctx, args) => {
    const value = {
      key: FILTER_OPTIONS_CACHE_KEY,
      data: args.data,
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
  },
})

// Rebuilds the filter-options cache one state at a time so no single
// transaction scans the whole catalog. The action accumulates per-state slices
// in memory (action memory, not a DB transaction) and writes the merged blob
// in one small mutation at the end.
export const rebuildFilterOptionsCache = internalAction({
  args: {},
  handler: async (ctx) => {
    const stateIds = await ctx.runQuery(
      internal.stations.listStateExternalIds,
      {},
    )

    const states: FilterOptionsPayload['states'] = []
    const municipalities: FilterOptionsPayload['municipalities'] = []
    for (const stateExternalId of stateIds) {
      const chunk = await ctx.runQuery(
        internal.stations.filterOptionsForState,
        { stateExternalId },
      )
      if (!chunk) continue
      states.push(chunk.state)
      for (const m of chunk.municipalities) municipalities.push(m)
    }

    states.sort((a, b) => a.name.localeCompare(b.name))
    municipalities.sort((a, b) => a.name.localeCompare(b.name))

    const payload: FilterOptionsPayload = { states, municipalities }
    await ctx.runMutation(internal.stations.writeFilterOptionsCache, {
      data: JSON.stringify(payload),
    })

    return {
      states: states.length,
      municipalities: municipalities.length,
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
