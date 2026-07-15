import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import { latBucketFor } from './geocells'
import { loadEnrichment, type StationEnrichment } from './enrichment'
import { fuelTypeValidator, sortModeValidator } from './validators'

const fuelType = fuelTypeValidator
const sortMode = sortModeValidator

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

// Bound the nearby candidate set before ranking the embedded listing prices.
const NEARBY_PRICE_CANDIDATES = 120

// Cap on stations read to compute a state/municipality bounding box for map
// framing. States top out around ~1500 docs, so this covers the whole catalog;
// a partial sample would still frame the area well.
const AREA_BOUNDS_SCAN_CAP = 4000

const MIN_PLAUSIBLE_PRICE = 15
const MAX_PLAUSIBLE_PRICE = 50

type FuelType = Doc<'fuelPricesCurrent'>['fuelType']
type ParsedMunicipality = { state: string | null; muni: string }
type StationRow = {
  station: Doc<'stations'>
  prices: Record<string, { price: number }>
  highlightedPrice: number | null
  distanceKm?: number | null
}

type ListingDoc = Doc<'stationListings'>

function stationFromListing(listing: ListingDoc): Doc<'stations'> {
  return {
    _id: listing.stationId,
    _creationTime: listing._creationTime,
    permitNumber: listing.permitNumber,
    name: listing.name,
    address: listing.address,
    stateExternalId: listing.stateExternalId,
    municipalityExternalId: listing.municipalityExternalId,
    stateName: listing.stateName,
    municipalityName: listing.municipalityName,
    latitude: listing.latitude,
    longitude: listing.longitude,
    latBucket: listing.latBucket,
    source: 'CNE',
    firstSeenAt: listing.firstSeenAt,
    lastSeenAt: listing.updatedAt,
  }
}

function rowFromListing(
  listing: ListingDoc,
  fuelTypes: FuelType[],
  distanceKm: number | null = null,
): StationRow & { enrichment: StationEnrichment | null } {
  const prices = listing.prices as Record<string, { price: number }>
  return {
    station: stationFromListing(listing),
    prices,
    highlightedPrice: pickHighlightedPrice(prices, fuelTypes),
    distanceKm,
    enrichment: listing.enrichment ?? null,
  }
}

function listingPrice(listing: ListingDoc, fuelType: FuelType): number | undefined {
  return listing.prices[fuelType]?.price
}

async function loadListingsForSelections(
  ctx: QueryCtx,
  stateIds: string[],
  parsedMunis: ParsedMunicipality[],
): Promise<ListingDoc[]> {
  const out: ListingDoc[] = []
  const seen = new Set<string>()
  const push = (rows: ListingDoc[]) => {
    for (const row of rows) {
      if (seen.has(row.permitNumber)) continue
      seen.add(row.permitNumber)
      out.push(row)
    }
  }
  const munisWithState = parsedMunis.filter((m) => m.state)
  if (munisWithState.length > 0) {
    for (const m of munisWithState) {
      push(
        await ctx.db
          .query('stationListings')
          .withIndex('by_location', (q) =>
            q
              .eq('stateExternalId', m.state as string)
              .eq('municipalityExternalId', m.muni),
          )
          .collect(),
      )
    }
  } else {
    for (const stateExternalId of stateIds) {
      push(
        await ctx.db
          .query('stationListings')
          .withIndex('by_state', (q) =>
            q.eq('stateExternalId', stateExternalId),
          )
          .collect(),
      )
    }
  }
  return out
}

type FuelMetric = {
  fuelType: FuelType
  average: number | null
  min: number | null
  max: number | null
  count: number
}

function parseOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0
  const value = Number.parseInt(cursor.replace(/^\D+/, ''), 10)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function cleanExternalId(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(trimmed)
      return typeof parsed === 'string' && parsed.trim()
        ? parsed.trim()
        : undefined
    } catch {
      return trimmed.slice(1, -1) || undefined
    }
  }
  return trimmed
}

function cleanMunicipalityExternalId(
  value: string | null | undefined,
): string | undefined {
  const clean = cleanExternalId(value)
  if (!clean) return undefined
  return clean.includes('|') ? clean.split('|')[1] : clean
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

function slugifyLocationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function summarizePrices(
  prices: Doc<'fuelPricesCurrent'>[],
  fuelType: FuelType,
): FuelMetric {
  if (prices.length === 0) {
    return { fuelType, average: null, min: null, max: null, count: 0 }
  }
  let sum = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const price of prices) {
    sum += price.price
    min = Math.min(min, price.price)
    max = Math.max(max, price.price)
  }
  return {
    fuelType,
    average: sum / prices.length,
    min,
    max,
    count: prices.length,
  }
}

function isPlausiblePrice(price: number): boolean {
  return price >= MIN_PLAUSIBLE_PRICE && price <= MAX_PLAUSIBLE_PRICE
}

function filterRowsByFuel<T extends StationRow>(rows: T[], fuelTypes: FuelType[]): T[] {
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

async function paginateListingPriceIndex(
  ctx: QueryCtx,
  args: {
    fuelType: FuelType
    stateExternalId?: string
    municipalityExternalId?: string
    paginationOpts: { cursor: string | null; numItems: number }
  },
) {
  const state = args.stateExternalId
  const municipality = args.municipalityExternalId
  if (state && municipality) {
    switch (args.fuelType) {
      case 'premium':
        return await ctx.db.query('stationListings').withIndex(
          'by_location_premium_price',
          (q) => q.eq('stateExternalId', state).eq('municipalityExternalId', municipality).gt('premiumPrice', 0),
        ).paginate(args.paginationOpts)
      case 'diesel':
        return await ctx.db.query('stationListings').withIndex(
          'by_location_diesel_price',
          (q) => q.eq('stateExternalId', state).eq('municipalityExternalId', municipality).gt('dieselPrice', 0),
        ).paginate(args.paginationOpts)
      case 'duba':
        return await ctx.db.query('stationListings').withIndex(
          'by_location_duba_price',
          (q) => q.eq('stateExternalId', state).eq('municipalityExternalId', municipality).gt('dubaPrice', 0),
        ).paginate(args.paginationOpts)
      case 'unknown':
        return await ctx.db.query('stationListings').withIndex(
          'by_location_unknown_price',
          (q) => q.eq('stateExternalId', state).eq('municipalityExternalId', municipality).gt('unknownPrice', 0),
        ).paginate(args.paginationOpts)
      default:
        return await ctx.db.query('stationListings').withIndex(
          'by_location_regular_price',
          (q) => q.eq('stateExternalId', state).eq('municipalityExternalId', municipality).gt('regularPrice', 0),
        ).paginate(args.paginationOpts)
    }
  }
  if (state) {
    switch (args.fuelType) {
      case 'premium':
        return await ctx.db.query('stationListings').withIndex(
          'by_state_premium_price',
          (q) => q.eq('stateExternalId', state).gt('premiumPrice', 0),
        ).paginate(args.paginationOpts)
      case 'diesel':
        return await ctx.db.query('stationListings').withIndex(
          'by_state_diesel_price',
          (q) => q.eq('stateExternalId', state).gt('dieselPrice', 0),
        ).paginate(args.paginationOpts)
      case 'duba':
        return await ctx.db.query('stationListings').withIndex(
          'by_state_duba_price',
          (q) => q.eq('stateExternalId', state).gt('dubaPrice', 0),
        ).paginate(args.paginationOpts)
      case 'unknown':
        return await ctx.db.query('stationListings').withIndex(
          'by_state_unknown_price',
          (q) => q.eq('stateExternalId', state).gt('unknownPrice', 0),
        ).paginate(args.paginationOpts)
      default:
        return await ctx.db.query('stationListings').withIndex(
          'by_state_regular_price',
          (q) => q.eq('stateExternalId', state).gt('regularPrice', 0),
        ).paginate(args.paginationOpts)
    }
  }
  switch (args.fuelType) {
    case 'premium':
      return await ctx.db.query('stationListings').withIndex(
        'by_premium_price',
        (q) => q.gt('premiumPrice', 0),
      ).paginate(args.paginationOpts)
    case 'diesel':
      return await ctx.db.query('stationListings').withIndex(
        'by_diesel_price',
        (q) => q.gt('dieselPrice', 0),
      ).paginate(args.paginationOpts)
    case 'duba':
      return await ctx.db.query('stationListings').withIndex(
        'by_duba_price',
        (q) => q.gt('dubaPrice', 0),
      ).paginate(args.paginationOpts)
    case 'unknown':
      return await ctx.db.query('stationListings').withIndex(
        'by_unknown_price',
        (q) => q.gt('unknownPrice', 0),
      ).paginate(args.paginationOpts)
    default:
      return await ctx.db.query('stationListings').withIndex(
        'by_regular_price',
        (q) => q.gt('regularPrice', 0),
      ).paginate(args.paginationOpts)
  }
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
  const isSingleScope =
    params.stateIds.length <= 1 &&
    params.parsedMunis.length <= 1 &&
    (!params.singleMuni || Boolean(locationScopedMuni))

  if (isSingleScope) {
    const page = await paginateListingPriceIndex(ctx, {
      fuelType: primaryFuel,
      stateExternalId: stateScoped ?? undefined,
      municipalityExternalId: locationScopedMuni?.muni,
      paginationOpts: params.paginationOpts,
    })
    return {
      ...page,
      page: page.page.map((listing) =>
        rowFromListing(listing, params.fuelTypes),
      ),
    }
  }

  const listings = await loadListingsForSelections(
    ctx,
    params.stateIds,
    params.parsedMunis,
  )
  const ordered = listings
    .filter((listing) => listingPrice(listing, primaryFuel) !== undefined)
    .sort(
      (a, b) =>
        (listingPrice(a, primaryFuel) ?? Infinity) -
          (listingPrice(b, primaryFuel) ?? Infinity) ||
        a.name.localeCompare(b.name),
    )
  const page = paginateArray(
    ordered,
    params.paginationOpts.cursor,
    params.paginationOpts.numItems,
  )
  return {
    ...page,
    page: page.page.map((listing) => rowFromListing(listing, params.fuelTypes)),
  }
}

// Bounding box of every station in a state (or a single municipality), used to
// frame the explore map when a place is picked from the filters. Read-only;
// reuses the by_state / by_location indexes and caps the read so a huge state
// can't blow the per-query budget (a partial sample still frames it well).
export const areaBounds = query({
  args: {
    stateExternalId: v.optional(v.string()),
    municipalityExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stateExternalId = cleanExternalId(args.stateExternalId)
    if (!stateExternalId) return null
    const municipalityExternalId = cleanMunicipalityExternalId(
      args.municipalityExternalId,
    )

    const cachedKey = municipalityExternalId
      ? `${stateExternalId}|${municipalityExternalId}`
      : stateExternalId
    const cached = await ctx.db
      .query('locationBounds')
      .withIndex('by_key', (q) => q.eq('key', cachedKey))
      .unique()
    if (cached) {
      return {
        swLat: cached.swLat,
        swLon: cached.swLon,
        neLat: cached.neLat,
        neLon: cached.neLon,
      }
    }

    const rows = municipalityExternalId
      ? await ctx.db
          .query('stations')
          .withIndex('by_location', (q) =>
            q
              .eq('stateExternalId', stateExternalId)
              .eq('municipalityExternalId', municipalityExternalId),
          )
          .take(AREA_BOUNDS_SCAN_CAP)
      : await ctx.db
          .query('stations')
          .withIndex('by_state', (q) => q.eq('stateExternalId', stateExternalId))
          .take(AREA_BOUNDS_SCAN_CAP)

    let swLat = Infinity
    let swLon = Infinity
    let neLat = -Infinity
    let neLon = -Infinity
    let count = 0
    for (const s of rows) {
      if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') continue
      count += 1
      swLat = Math.min(swLat, s.latitude)
      neLat = Math.max(neLat, s.latitude)
      swLon = Math.min(swLon, s.longitude)
      neLon = Math.max(neLon, s.longitude)
    }
    if (count === 0) return null
    return { swLat, swLon, neLat, neLon }
  },
})

async function loadListingsWithinRadius(
  ctx: QueryCtx,
  userLocation: { latitude: number; longitude: number },
  maxDistanceKm: number,
  cap = 4_000,
): Promise<Array<{ listing: ListingDoc; distanceKm: number }>> {
  const latDelta = maxDistanceKm / 111.32
  const cosLat = Math.cos(toRad(userLocation.latitude))
  const lonDelta = maxDistanceKm / (111.32 * Math.max(Math.abs(cosLat), 0.01))
  const minLat = userLocation.latitude - latDelta
  const maxLat = userLocation.latitude + latDelta
  const minLon = userLocation.longitude - lonDelta
  const maxLon = userLocation.longitude + lonDelta
  const found: Array<{ listing: ListingDoc; distanceKm: number }> = []

  for (
    let bucket = latBucketFor(minLat);
    bucket <= latBucketFor(maxLat) && found.length < cap;
    bucket++
  ) {
    const rows = await ctx.db
      .query('stationListings')
      .withIndex('by_lat_lon', (q) =>
        q.eq('latBucket', bucket).gte('longitude', minLon).lte('longitude', maxLon),
      )
      .take(cap - found.length)
    for (const listing of rows) {
      if (typeof listing.latitude !== 'number' || typeof listing.longitude !== 'number') {
        continue
      }
      const distanceKm = haversineKm(
        userLocation.latitude,
        userLocation.longitude,
        listing.latitude,
        listing.longitude,
      )
      if (distanceKm <= maxDistanceKm) found.push({ listing, distanceKm })
    }
  }
  return found.sort((a, b) => a.distanceKm - b.distanceKm)
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

  const required = parseOffset(params.paginationOpts.cursor) + params.paginationOpts.numItems
  let candidates: Array<{ listing: ListingDoc; distanceKm: number }>
  if (hasIndexedSelection) {
    const listings = await loadListingsForSelections(
      ctx,
      params.stateIds,
      params.parsedMunis,
    )
    candidates = listings.flatMap((listing) => {
      if (
        typeof listing.latitude !== 'number' ||
        typeof listing.longitude !== 'number'
      ) {
        return []
      }
      return [
        {
          listing,
          distanceKm: haversineKm(
            params.userLocation.latitude,
            params.userLocation.longitude,
            listing.latitude,
            listing.longitude,
          ),
        },
      ]
    })
  } else {
    candidates = []
    for (const radius of [25, 100, 500]) {
      candidates = await loadListingsWithinRadius(
        ctx,
        params.userLocation,
        radius,
        DISTANCE_SCAN_CAP,
      )
      if (candidates.length >= required) break
    }
  }

  const sorted = candidates
    .filter(({ listing }) =>
      stationMatchesSelections(
        stationFromListing(listing),
        params.stateIds,
        params.parsedMunis,
      ),
    )
    .sort((a, b) => {
      return (
        a.distanceKm - b.distanceKm ||
        a.listing.name.localeCompare(b.listing.name)
      )
    })

  const page = paginateArray(
    sorted,
    params.paginationOpts.cursor,
    params.paginationOpts.numItems,
  )
  const rows = filterRowsByFuel(
    page.page.map(({ listing, distanceKm }) =>
      rowFromListing(listing, params.fuelTypes, distanceKm),
    ),
    params.fuelTypes,
  )

  return { ...page, page: rows }
}

// One-time backfill of latBucket for existing stations so the 2D nearby search
// can find them. Idempotent (skips rows that already have it); self-reschedules.
// Run: `bunx convex run stations:backfillLatBuckets '{}'`.
export const backfillLatBuckets = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('stations')
      .paginate({ cursor: args.cursor ?? null, numItems: 200 })
    let updated = 0
    for (const station of page.page) {
      if (typeof station.latitude === 'number' && station.latBucket === undefined) {
        await ctx.db.patch(station._id, { latBucket: latBucketFor(station.latitude) })
        updated += 1
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.stations.backfillLatBuckets, {
        cursor: page.continueCursor,
      })
    }
    return { updated, isDone: page.isDone }
  },
})

export const bestNearbyStations = query({
  args: {
    fuelType,
    userLocation: v.object({ latitude: v.number(), longitude: v.number() }),
    limit: v.optional(v.number()),
    maxDistanceKm: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 20)
    const maxDistanceKm = Math.min(Math.max(args.maxDistanceKm ?? 15, 1), 100)
    const candidates = await loadListingsWithinRadius(
      ctx,
      args.userLocation,
      maxDistanceKm,
      NEARBY_PRICE_CANDIDATES,
    )
    const top = candidates
      .flatMap(({ listing, distanceKm }) => {
        const price = listing.prices[args.fuelType]
        return price
          ? [{
              station: stationFromListing(listing),
              price: price.price,
              reportedAt: price.reportedAt,
              distanceKm,
              enrichment: listing.enrichment ?? null,
            }]
          : []
      })
      .sort(
        (a, b) =>
          a.price - b.price ||
          a.distanceKm - b.distanceKm ||
          a.station.name.localeCompare(b.station.name),
      )
      .slice(0, limit)
    return top
  },
})

export const seoLocationOverview = query({
  args: {
    stateSlug: v.string(),
    municipalitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [states, filterOptions] = await Promise.all([
      ctx.db.query('states').collect(),
      ctx.db
        .query('filterOptionsCache')
        .withIndex('by_key', (q) => q.eq('key', FILTER_OPTIONS_CACHE_KEY))
        .unique(),
    ])

    const state = states.find((s) => slugifyLocationName(s.name) === args.stateSlug)
    if (!state) return null

    const municipalities = await ctx.db
      .query('municipalities')
      .withIndex('by_state', (q) => q.eq('stateExternalId', state.externalId))
      .collect()
    const municipality = args.municipalitySlug
      ? municipalities.find((m) => slugifyLocationName(m.name) === args.municipalitySlug)
      : null
    if (args.municipalitySlug && !municipality) return null

    const fuelTypes: FuelType[] = ['regular', 'premium', 'diesel', 'duba']
    const priceGroups = await Promise.all(
      fuelTypes.map((ft) =>
        municipality
          ? ctx.db
              .query('fuelPricesCurrent')
              .withIndex('by_location_fuel_price', (q) =>
                q
                  .eq('stateExternalId', state.externalId)
                  .eq('municipalityExternalId', municipality.externalId)
                  .eq('fuelType', ft),
              )
              .collect()
          : ctx.db
              .query('fuelPricesCurrent')
              .withIndex('by_state_fuel_price', (q) =>
                q.eq('stateExternalId', state.externalId).eq('fuelType', ft),
              )
              .collect(),
      ),
    )

    const curatedPriceGroups = priceGroups.map((prices) =>
      prices.filter((price) => isPlausiblePrice(price.price)),
    )
    const rawMetrics = priceGroups.map((prices, i) =>
      summarizePrices(prices, fuelTypes[i]),
    )
    const curatedMetrics = curatedPriceGroups.map((prices, i) =>
      summarizePrices(prices, fuelTypes[i]),
    )
    const excludedPriceRows = priceGroups.reduce(
      (total, prices) =>
        total + prices.filter((price) => !isPlausiblePrice(price.price)).length,
      0,
    )
    const buildTopRegular = async (prices: Doc<'fuelPricesCurrent'>[]) => {
      const primaryPrices = prices
        .slice()
        .sort(
          (a, b) =>
            a.price - b.price ||
            a.stationPermitNumber.localeCompare(b.stationPermitNumber),
        )
        .slice(0, 10)

      return (
        await Promise.all(
          primaryPrices.map(async (price) => {
            const station = await ctx.db
              .query('stations')
              .withIndex('by_permit', (q) =>
                q.eq('permitNumber', price.stationPermitNumber),
              )
              .unique()
            return station
              ? {
                  station,
                  price: price.price,
                  reportedAt: price.reportedAt,
                }
              : null
          }),
        )
      ).filter((row): row is NonNullable<typeof row> => row !== null)
    }

    const [curatedTopRegular, rawTopRegular] = await Promise.all([
      buildTopRegular(curatedPriceGroups[0]),
      buildTopRegular(priceGroups[0]),
    ])

    const stationCount = municipality
      ? await ctx.db
          .query('stations')
          .withIndex('by_location', (q) =>
            q
              .eq('stateExternalId', state.externalId)
              .eq('municipalityExternalId', municipality.externalId),
          )
          .collect()
      : await ctx.db
          .query('stations')
          .withIndex('by_state', (q) => q.eq('stateExternalId', state.externalId))
          .collect()

    const nav = filterOptions
      ? (JSON.parse(filterOptions.data) as FilterOptionsPayload)
      : EMPTY_FILTER_OPTIONS
    const stateMunicipalityCounts = new Map(
      nav.municipalities
        .filter((m) => m.stateExternalId === state.externalId)
        .map((m) => [m.externalId, m.count]),
    )

    return {
      state: {
        externalId: state.externalId,
        name: state.name,
        slug: slugifyLocationName(state.name),
      },
      municipality: municipality
        ? {
            externalId: municipality.externalId,
            name: municipality.name,
            slug: slugifyLocationName(municipality.name),
          }
        : null,
      metrics: curatedMetrics,
      stationCount: stationCount.length,
      topRegular: curatedTopRegular,
      views: {
        curated: {
          metrics: curatedMetrics,
          topRegular: curatedTopRegular,
        },
        raw: {
          metrics: rawMetrics,
          topRegular: rawTopRegular,
        },
      },
      priceBand: { min: MIN_PLAUSIBLE_PRICE, max: MAX_PLAUSIBLE_PRICE },
      excludedPriceRows,
      states: nav.states.map((s) => ({
        ...s,
        slug: slugifyLocationName(s.name),
      })),
      municipalities: municipalities
        .map((m) => ({
          externalId: m.externalId,
          stateExternalId: m.stateExternalId,
          name: m.name,
          slug: slugifyLocationName(m.name),
          count: stateMunicipalityCounts.get(m.externalId) ?? 0,
        }))
        .filter((m) => m.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }
  },
})

export const seoSitemapLocations = query({
  args: {},
  handler: async (ctx): Promise<SitemapLocationsPayload> => {
    const cached = await ctx.db
      .query('filterOptionsCache')
      .withIndex('by_key', (q) => q.eq('key', SITEMAP_LOCATIONS_CACHE_KEY))
      .unique()
    if (cached) return JSON.parse(cached.data) as SitemapLocationsPayload

    const [states, municipalities] = await Promise.all([
      ctx.db.query('states').collect(),
      ctx.db.query('municipalities').collect(),
    ])
    if (!states.length) return EMPTY_SITEMAP_LOCATIONS

    return {
      states: states.map((s) => ({
        externalId: s.externalId,
        slug: slugifyLocationName(s.name),
      })),
      municipalities: municipalities.map((m) => ({
        externalId: m.externalId,
        stateExternalId: m.stateExternalId,
        slug: slugifyLocationName(m.name),
      })),
    }
  },
})

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
    const stateIds = (args.stateExternalIds ?? []).flatMap((id) => {
      const clean = cleanExternalId(id)
      return clean ? [clean] : []
    })
    const muniIds = (args.municipalityExternalIds ?? []).flatMap((id) => {
      const clean = cleanExternalId(id)
      return clean ? [clean] : []
    })
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
      page: ListingDoc[]
      isDone: boolean
      continueCursor: string
    }
    if (useSearch) {
      let q = ctx.db
        .query('stationListings')
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
        await loadListingsForSelections(ctx, stateIds, parsedMunis)
      ).filter((s) =>
        stationMatchesSelections(stationFromListing(s), stateIds, parsedMunis),
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
        .query('stationListings')
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
      const filtered = await loadListingsForSelections(ctx, stateIds, [])
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
        .query('stationListings')
        .withIndex('by_name', (q) => q)
        .paginate(args.paginationOpts)
      paginated = {
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      }
    }

    let rows = paginated.page.map((listing) =>
      rowFromListing(listing, fuelTypes),
    )

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
    stateExternalIds: v.optional(v.array(v.string())),
    municipalityExternalIds: v.optional(v.array(v.string())),
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
    const stateIds = (args.stateExternalIds ?? []).flatMap((id) => {
      const clean = cleanExternalId(id)
      return clean ? [clean] : []
    })
    const parsedMunis = (args.municipalityExternalIds ?? []).flatMap((id) => {
      const clean = cleanExternalId(id)
      if (!clean) return []
      const sep = clean.indexOf('|')
      return sep >= 0
        ? [{ state: clean.slice(0, sep), muni: clean.slice(sep + 1) }]
        : [{ state: null as string | null, muni: clean }]
    })

    // Stream the by_lat index and stop as soon as we have enough so a national
    // view doesn't read all 8k+ stations at once. We must NOT use `.paginate()`
    // here: Convex allows only one paginated query per function and a
    // server-side pagination loop calls it repeatedly, which the backend
    // rejects with "ran multiple paginated queries". Async iteration reads
    // lazily and lets us break early without any pagination call. The previous
    // `.collect()` version pulled every station in the lat range and timed out
    // the self-hosted op budget once the catalog filled up.
    const selected: ListingDoc[] = []
    let truncated = false
    const selectionScoped =
      stateIds.length > 0 || parsedMunis.length > 0
        ? await loadListingsForSelections(ctx, stateIds, parsedMunis)
        : null

    const considerStation = (listing: ListingDoc) => {
      const lat = listing.latitude
      const lon = listing.longitude
      if (
        typeof lat === 'number' &&
        typeof lon === 'number' &&
        stationMatchesSelections(
          stationFromListing(listing),
          stateIds,
          parsedMunis,
        ) &&
        lat >= swLat &&
        lat <= neLat &&
        lon >= swLon &&
        lon <= neLon
      ) {
        selected.push(listing)
        if (selected.length >= limit) {
          truncated = true
          return false
        }
      }
      return true
    }

    if (selectionScoped) {
      for (const listing of selectionScoped) {
        if (!considerStation(listing)) break
      }
    } else {
      const minBucket = latBucketFor(swLat)
      const maxBucket = latBucketFor(neLat)
      for (let bucket = minBucket; bucket <= maxBucket; bucket++) {
        const rows = await ctx.db
          .query('stationListings')
          .withIndex('by_lat_lon', (q) =>
            q.eq('latBucket', bucket).gte('longitude', swLon).lte('longitude', neLon),
          )
          .take(Math.min(MAX_STATION_SCAN, limit - selected.length))
        for (const listing of rows) {
          if (!considerStation(listing)) break
        }
        if (selected.length >= limit) {
          truncated = true
          break
        }
      }
    }
    const projected = selected
      .map((listing) => rowFromListing(listing, fuelTypes))
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

    const enrichmentMap = await loadEnrichment(ctx, [args.permitNumber])

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
      enrichment: enrichmentMap.get(args.permitNumber) ?? null,
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
        const listing = await ctx.db
          .query('stationListings')
          .withIndex('by_permit', (q) => q.eq('permitNumber', permit))
          .unique()
        return listing ? rowFromListing(listing, []) : null
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
const SITEMAP_LOCATIONS_CACHE_KEY = 'sitemap-locations'

const EMPTY_FILTER_OPTIONS: FilterOptionsPayload = {
  states: [],
  municipalities: [],
}

type SitemapLocationsPayload = {
  states: { externalId: string; slug: string }[]
  municipalities: {
    externalId: string
    stateExternalId: string
    slug: string
  }[]
}

const EMPTY_SITEMAP_LOCATIONS: SitemapLocationsPayload = {
  states: [],
  municipalities: [],
}

function buildSitemapLocationsPayload(
  nav: FilterOptionsPayload,
): SitemapLocationsPayload {
  return {
    states: nav.states.map((s) => ({
      externalId: s.externalId,
      slug: slugifyLocationName(s.name),
    })),
    municipalities: nav.municipalities.map((m) => ({
      externalId: m.externalId,
      stateExternalId: m.stateExternalId,
      slug: slugifyLocationName(m.name),
    })),
  }
}

export const listFilterOptions = query({
  args: {},
  handler: async (ctx): Promise<FilterOptionsPayload> => {
    // Serve the precomputed snapshot. Building it live would require scanning
    // the whole catalog (~13.7k stations) in one transaction, which trips the
    // self-hosted op budget — that is why we never compute it inline. The
    // snapshot is kept fresh by `rebuildFilterOptionsCache` (cron + manual), so
    // an empty result only happens on a cold deployment before the first build.
    const cached = await ctx.db
      .query('filterOptionsCache')
      .withIndex('by_key', (q) => q.eq('key', FILTER_OPTIONS_CACHE_KEY))
      .unique()
    if (!cached) return EMPTY_FILTER_OPTIONS
    return JSON.parse(cached.data) as FilterOptionsPayload
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
  args: { data: v.string(), sitemapData: v.string() },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString()
    for (const value of [
      {
        key: FILTER_OPTIONS_CACHE_KEY,
        data: args.data,
        updatedAt,
      },
      {
        key: SITEMAP_LOCATIONS_CACHE_KEY,
        data: args.sitemapData,
        updatedAt,
      },
    ]) {
      const existing = await ctx.db
        .query('filterOptionsCache')
        .withIndex('by_key', (q) => q.eq('key', value.key))
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, value)
      } else {
        await ctx.db.insert('filterOptionsCache', value)
      }
    }
  },
})

// Rebuilds the filter-options cache one state at a time so no single
// transaction scans the whole catalog. The action accumulates per-state slices
// in memory (action memory, not a DB transaction) and writes the merged blob
// in one small mutation at the end.
export const rebuildFilterOptionsCache = internalAction({
  args: { scheduleMetrics: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
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
      sitemapData: JSON.stringify(buildSitemapLocationsPayload(payload)),
    })

    if (args.scheduleMetrics) {
      await ctx.scheduler.runAfter(0, internal.metrics.rebuildMetricsCache, {
        scheduleGeocoding: true,
      })
    }

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
      .query('stationListings')
      .withIndex('by_name', (q) => q)
      .paginate(args.paginationOpts)

    const stations = result.page.map((s) => {
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
        source: 'CNE' as const,
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.updatedAt,
        prices: s.prices,
      }
    })

    return {
      stations,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})
