import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { getDatabase } from '#/db/client'
import {
  filterOptionsCache,
  fuelPricesCurrent,
  fuelPricesHistory,
  ingestionRuns,
  metricsCache,
  municipalities,
  states,
  stationEnrichment,
  stationListings,
  stations,
  type ListingPrices,
} from '#/db/schema'
import { slugifyLocationName } from '#/lib/slug'
import type {
  FilterOptions,
  FuelType,
  PublicStation,
  StationRow,
  UserLocation,
} from '../domain/models'
import type {
  BoundsInput,
  ListStationsInput,
} from '../application/dtos/public-data.dto'
import type { PublicDataRepository } from '../application/ports/public-data.repository'

const EMPTY_FILTER_OPTIONS: FilterOptions = { states: [], municipalities: [] }
const MEXICO_BOUNDS = { swLat: 14.5, swLon: -118.5, neLat: 32.7, neLon: -86.5 }
const MIN_PLAUSIBLE_PRICE = 15
const MAX_PLAUSIBLE_PRICE = 50

type SitemapLocations = {
  states: { externalId: string; slug: string }[]
  municipalities: {
    externalId: string
    stateExternalId: string
    slug: string
  }[]
}

type Listing = typeof stationListings.$inferSelect
type Station = typeof stations.$inferSelect

function iso(value: Date | null | undefined) {
  return value?.toISOString()
}

function cleanExternalId(value: string | null | undefined) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : undefined
    } catch {
      return trimmed.slice(1, -1) || undefined
    }
  }
  return trimmed
}

function parseOffset(cursor: string | null | undefined) {
  if (!cursor) return 0
  const value = Number.parseInt(cursor.replace(/^\D+/, ''), 10)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function toPublicStation(row: Station): PublicStation {
  return {
    _id: row.id,
    _creationTime: row.convexCreationTime,
    ...(row.placeId ? { placeId: row.placeId } : {}),
    permitNumber: row.permitNumber,
    name: row.name,
    address: row.address,
    stateExternalId: row.stateExternalId,
    municipalityExternalId: row.municipalityExternalId,
    ...(row.stateName ? { stateName: row.stateName } : {}),
    ...(row.municipalityName ? { municipalityName: row.municipalityName } : {}),
    ...(row.latitude == null ? {} : { latitude: row.latitude }),
    ...(row.longitude == null ? {} : { longitude: row.longitude }),
    ...(row.latBucket == null ? {} : { latBucket: row.latBucket }),
    ...(row.coordinateStatus ? { coordinateStatus: row.coordinateStatus } : {}),
    ...(row.coordinateCheckedAt
      ? { coordinateCheckedAt: row.coordinateCheckedAt.toISOString() }
      : {}),
    source: 'CNE',
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  }
}

function stationFromListing(row: Listing): PublicStation {
  return {
    _id: row.stationId,
    _creationTime: row.convexCreationTime,
    permitNumber: row.permitNumber,
    name: row.name,
    address: row.address,
    stateExternalId: row.stateExternalId,
    municipalityExternalId: row.municipalityExternalId,
    ...(row.stateName ? { stateName: row.stateName } : {}),
    ...(row.municipalityName ? { municipalityName: row.municipalityName } : {}),
    ...(row.latitude == null ? {} : { latitude: row.latitude }),
    ...(row.longitude == null ? {} : { longitude: row.longitude }),
    ...(row.latBucket == null ? {} : { latBucket: row.latBucket }),
    source: 'CNE',
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.updatedAt.toISOString(),
  }
}

function highlightedPrice(prices: ListingPrices, fuels: FuelType[]) {
  for (const fuel of fuels) {
    const price = prices[fuel]?.price
    if (price != null) return price
  }
  return (
    prices.regular?.price ??
    prices.premium?.price ??
    prices.diesel?.price ??
    prices.duba?.price ??
    prices.unknown?.price ??
    null
  )
}

function rowFromListing(
  listing: Listing,
  fuels: FuelType[],
  distanceKm?: number | null,
): StationRow {
  return {
    station: stationFromListing(listing),
    prices: listing.prices,
    highlightedPrice: highlightedPrice(listing.prices, fuels),
    ...(distanceKm === undefined ? {} : { distanceKm }),
    enrichment: listing.enrichment ?? null,
  }
}

const toRad = (degrees: number) => (degrees * Math.PI) / 180
function haversineKm(a: UserLocation, b: { latitude: number; longitude: number }) {
  const radius = 6371
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(value))
}

function selectionCondition(
  stateExternalIds: string[],
  municipalityExternalIds: string[],
): SQL | undefined {
  const statesClean = stateExternalIds.flatMap((id) => {
    const clean = cleanExternalId(id)
    return clean ? [clean] : []
  })
  const municipalitiesClean = municipalityExternalIds.flatMap((id) => {
    const clean = cleanExternalId(id)
    return clean ? [clean] : []
  })
  const composite = municipalitiesClean.flatMap((id) => {
    const separator = id.indexOf('|')
    return separator < 0
      ? []
      : [
          and(
            eq(stationListings.stateExternalId, id.slice(0, separator)),
            eq(stationListings.municipalityExternalId, id.slice(separator + 1)),
          ) as SQL,
        ]
  })
  const bare = municipalitiesClean.filter((id) => !id.includes('|'))
  const choices: SQL[] = [...composite]
  if (bare.length > 0) {
    choices.push(
      and(
        inArray(stationListings.municipalityExternalId, bare),
        statesClean.length
          ? inArray(stationListings.stateExternalId, statesClean)
          : undefined,
      ) as SQL,
    )
  } else if (choices.length === 0 && statesClean.length > 0) {
    choices.push(inArray(stationListings.stateExternalId, statesClean))
  }
  return choices.length === 0 ? undefined : or(...choices)
}

function fuelCondition(fuels: FuelType[]): SQL | undefined {
  if (fuels.length === 0) return undefined
  const choices = fuels.map((fuel) =>
    sql`${stationListings.prices} ? ${fuel}`,
  )
  return or(sql`jsonb_object_length(${stationListings.prices}) = 0`, ...choices)
}

const priceColumn = {
  regular: stationListings.regularPrice,
  premium: stationListings.premiumPrice,
  diesel: stationListings.dieselPrice,
  duba: stationListings.dubaPrice,
  unknown: stationListings.unknownPrice,
}

export async function readFilterOptions(): Promise<FilterOptions> {
  const { db } = getDatabase()
  const [cached] = await db
    .select({ data: filterOptionsCache.data })
    .from(filterOptionsCache)
    .where(eq(filterOptionsCache.key, 'default'))
    .limit(1)
  return (cached?.data as FilterOptions | undefined) ?? EMPTY_FILTER_OPTIONS
}

export async function readMetrics() {
  const { db } = getDatabase()
  const [cached] = await db
    .select({ data: metricsCache.data })
    .from(metricsCache)
    .where(eq(metricsCache.key, 'default'))
    .limit(1)
  return (
    cached?.data ?? {
      curated: null,
      raw: null,
      priceBand: { min: MIN_PLAUSIBLE_PRICE, max: MAX_PLAUSIBLE_PRICE },
      excludedPriceRows: 0,
      generatedAt: null,
    }
  )
}

export async function readLatestPriceRun() {
  const { db } = getDatabase()
  const [run] = await db
    .select()
    .from(ingestionRuns)
    .where(eq(ingestionRuns.kind, 'municipality_prices'))
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1)
  if (!run) return null
  return {
    _id: run.id,
    _creationTime: run.convexCreationTime,
    ...run,
    startedAt: run.startedAt.toISOString(),
    finishedAt: iso(run.finishedAt),
    heartbeatAt: iso(run.heartbeatAt),
  }
}

export async function readStationHistory(permitNumber: string) {
  const { db } = getDatabase()
  const rows = await db
    .select()
    .from(fuelPricesHistory)
    .where(eq(fuelPricesHistory.stationPermitNumber, permitNumber))
    .orderBy(desc(fuelPricesHistory.ingestedAt))
    .limit(120)
  return rows.map((row) => ({
    ...row,
    _id: row.id,
    _creationTime: row.convexCreationTime,
    reportedAt: iso(row.reportedAt),
    ingestedAt: row.ingestedAt.toISOString(),
  }))
}

export async function readStationDetail(permitNumber: string) {
  const { db } = getDatabase()
  const [station] = await db
    .select()
    .from(stations)
    .where(eq(stations.permitNumber, permitNumber))
    .limit(1)
  if (!station) return null

  const [prices, history, enrichmentRows] = await Promise.all([
    db
      .select()
      .from(fuelPricesCurrent)
      .where(eq(fuelPricesCurrent.stationPermitNumber, permitNumber)),
    readStationHistory(permitNumber),
    db
      .select()
      .from(stationEnrichment)
      .where(eq(stationEnrichment.stationPermitNumber, permitNumber))
      .limit(1),
  ])
  const enrichment = enrichmentRows[0]
  return {
    station: toPublicStation(station),
    enrichment: enrichment
      ? {
          brand: enrichment.brand,
          displayName: enrichment.displayName,
          source: enrichment.source,
        }
      : null,
    currentPrices: Object.fromEntries(
      prices.map((price) => [
        price.fuelType,
        { price: price.price, reportedAt: iso(price.reportedAt) },
      ]),
    ),
    history: history.map((row) => ({
      fuelType: row.fuelType,
      price: row.price,
      reportedAt: row.reportedAt,
      ingestedAt: row.ingestedAt,
    })),
  }
}

export async function readStationsByPermits(permitNumbers: string[]) {
  if (permitNumbers.length === 0) return []
  const permits = permitNumbers.slice(0, 200)
  const { db } = getDatabase()
  const rows = await db
    .select()
    .from(stationListings)
    .where(inArray(stationListings.permitNumber, permits))
  const byPermit = new Map(rows.map((row) => [row.permitNumber, row]))
  return permits.flatMap((permit) => {
    const row = byPermit.get(permit)
    return row ? [rowFromListing(row, [])] : []
  })
}

export async function readBestNearby(input: {
  fuelType: FuelType
  userLocation: UserLocation
  limit?: number
  maxDistanceKm?: number
}) {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 20)
  const radius = Math.min(Math.max(input.maxDistanceKm ?? 15, 1), 100)
  const latDelta = radius / 111.32
  const lonDelta =
    radius /
    (111.32 * Math.max(Math.abs(Math.cos(toRad(input.userLocation.latitude))), 0.01))
  const { db } = getDatabase()
  const rows = await db
    .select()
    .from(stationListings)
    .where(
      and(
        gte(stationListings.latitude, input.userLocation.latitude - latDelta),
        lte(stationListings.latitude, input.userLocation.latitude + latDelta),
        gte(stationListings.longitude, input.userLocation.longitude - lonDelta),
        lte(stationListings.longitude, input.userLocation.longitude + lonDelta),
        isNotNull(priceColumn[input.fuelType]),
      ),
    )
    .limit(1_000)
  return rows
    .flatMap((listing) => {
      if (listing.latitude == null || listing.longitude == null) return []
      const distanceKm = haversineKm(input.userLocation, {
        latitude: listing.latitude,
        longitude: listing.longitude,
      })
      const price = listing.prices[input.fuelType]
      if (!price || distanceKm > radius) return []
      return [
        {
          station: stationFromListing(listing),
          price: price.price,
          ...(price.reportedAt ? { reportedAt: price.reportedAt } : {}),
          distanceKm,
          enrichment: listing.enrichment ?? null,
        },
      ]
    })
    .sort(
      (a, b) =>
        a.price - b.price ||
        a.distanceKm - b.distanceKm ||
        a.station.name.localeCompare(b.station.name),
    )
    .slice(0, limit)
}

export async function readStationList(input: ListStationsInput) {
  const fuels = input.fuelTypes ?? []
  const offset = parseOffset(input.paginationOpts.cursor)
  const limit = Math.min(Math.max(input.paginationOpts.numItems, 1), 100)
  const selection = selectionCondition(
    input.stateExternalIds ?? [],
    input.municipalityExternalIds ?? [],
  )
  const term = input.search?.trim() ?? ''
  const search =
    term.length >= 2
      ? sql`immutable_unaccent(${stationListings.name} || ' ' || ${stationListings.permitNumber} || ' ' || ${stationListings.address}) %> immutable_unaccent(${term})`
      : undefined
  const fuel = fuelCondition(fuels)
  const { db } = getDatabase()

  const distanceRows =
    input.sortMode === 'distance' && input.userLocation
      ? await db
          .select()
          .from(stationListings)
          .where(and(selection, search, fuel))
          .limit(4_000)
      : null
  if (distanceRows && input.userLocation) {
    const ordered = distanceRows
      .map((listing) => ({
        listing,
        distanceKm:
          listing.latitude == null || listing.longitude == null
            ? null
            : haversineKm(input.userLocation as UserLocation, {
                latitude: listing.latitude,
                longitude: listing.longitude,
              }),
      }))
      .sort(
        (a, b) =>
          (a.distanceKm ?? Number.POSITIVE_INFINITY) -
          (b.distanceKm ?? Number.POSITIVE_INFINITY),
      )
    const page = ordered.slice(offset, offset + limit)
    return {
      page: page.map(({ listing, distanceKm }) =>
        rowFromListing(listing, fuels, distanceKm),
      ),
      isDone: offset + limit >= ordered.length,
      continueCursor: offset + limit >= ordered.length ? '' : `o:${offset + limit}`,
    }
  }

  const primaryFuel = fuels[0] ?? 'regular'
  const order =
    search
      ? [
          desc(
            sql`word_similarity(immutable_unaccent(${term}), immutable_unaccent(${stationListings.name} || ' ' || ${stationListings.permitNumber} || ' ' || ${stationListings.address}))`,
          ),
        ]
      : input.sortMode === 'price'
        ? [asc(priceColumn[primaryFuel]), asc(stationListings.name)]
        : [asc(stationListings.name)]
  const rows = await db
    .select()
    .from(stationListings)
    .where(and(selection, search, fuel))
    .orderBy(...order)
    .offset(offset)
    .limit(limit + 1)
  const isDone = rows.length <= limit
  return {
    page: rows.slice(0, limit).map((listing) => rowFromListing(listing, fuels)),
    isDone,
    continueCursor: isDone ? '' : `o:${offset + limit}`,
  }
}

export async function readStationsInBounds(input: BoundsInput) {
  const limit = Math.min(Math.max(input.limit ?? 800, 1), 800)
  const swLat = Math.max(input.swLat, MEXICO_BOUNDS.swLat)
  const swLon = Math.max(input.swLon, MEXICO_BOUNDS.swLon)
  const neLat = Math.min(input.neLat, MEXICO_BOUNDS.neLat)
  const neLon = Math.min(input.neLon, MEXICO_BOUNDS.neLon)
  if (swLat > neLat || swLon > neLon) return { stations: [], truncated: false }

  const fuels = input.fuelTypes ?? []
  const { db } = getDatabase()
  const rows = await db
    .select()
    .from(stationListings)
    .where(
      and(
        selectionCondition(
          input.stateExternalIds ?? [],
          input.municipalityExternalIds ?? [],
        ),
        gte(stationListings.latitude, swLat),
        lte(stationListings.latitude, neLat),
        gte(stationListings.longitude, swLon),
        lte(stationListings.longitude, neLon),
        fuelCondition(fuels),
      ),
    )
    .limit(limit + 1)
  return {
    stations: rows.slice(0, limit).map((listing) => rowFromListing(listing, fuels)),
    truncated: rows.length > limit,
  }
}

export async function readAreaBounds(input: {
  stateExternalId?: string
  municipalityExternalId?: string
}) {
  const state = cleanExternalId(input.stateExternalId)
  if (!state) return null
  const municipality = cleanExternalId(input.municipalityExternalId)?.split('|').at(-1)
  const { db } = getDatabase()
  const [result] = await db
    .select({
      swLat: sql<number>`min(${stationListings.latitude})`,
      swLon: sql<number>`min(${stationListings.longitude})`,
      neLat: sql<number>`max(${stationListings.latitude})`,
      neLon: sql<number>`max(${stationListings.longitude})`,
    })
    .from(stationListings)
    .where(
      and(
        eq(stationListings.stateExternalId, state),
        municipality
          ? eq(stationListings.municipalityExternalId, municipality)
          : undefined,
        isNotNull(stationListings.latitude),
        isNotNull(stationListings.longitude),
      ),
    )
  return result?.swLat == null ? null : result
}

export async function readSitemapLocations() {
  const { db } = getDatabase()
  const [cached] = await db
    .select({ data: filterOptionsCache.data })
    .from(filterOptionsCache)
    .where(eq(filterOptionsCache.key, 'sitemap-locations'))
    .limit(1)
  if (cached) return cached.data as SitemapLocations
  const [stateRows, municipalityRows] = await Promise.all([
    db.select().from(states),
    db.select().from(municipalities),
  ])
  return {
    states: stateRows.map((state) => ({
      externalId: state.externalId,
      slug: slugifyLocationName(state.name),
    })),
    municipalities: municipalityRows.map((municipality) => ({
      externalId: municipality.externalId,
      stateExternalId: municipality.stateExternalId,
      slug: slugifyLocationName(municipality.name),
    })),
  }
}

function summarizeFuelPrices(
  rows: Array<{ fuelType: FuelType; price: number }>,
  fuelType: FuelType,
) {
  const prices = rows.filter((row) => row.fuelType === fuelType).map((row) => row.price)
  return {
    fuelType,
    average: prices.length
      ? prices.reduce((total, price) => total + price, 0) / prices.length
      : null,
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null,
    count: prices.length,
  }
}

export async function readSeoLocationOverview(input: {
  stateSlug: string
  municipalitySlug?: string
}) {
  const { db } = getDatabase()
  const [stateRows, nav] = await Promise.all([db.select().from(states), readFilterOptions()])
  const state = stateRows.find((row) => slugifyLocationName(row.name) === input.stateSlug)
  if (!state) return null
  const municipalityRows = await db
    .select()
    .from(municipalities)
    .where(eq(municipalities.stateExternalId, state.externalId))
  const municipality = input.municipalitySlug
    ? municipalityRows.find(
        (row) => slugifyLocationName(row.name) === input.municipalitySlug,
      )
    : undefined
  if (input.municipalitySlug && !municipality) return null

  const locationWhere = and(
    eq(fuelPricesCurrent.stateExternalId, state.externalId),
    municipality
      ? eq(fuelPricesCurrent.municipalityExternalId, municipality.externalId)
      : undefined,
  )
  const priceRows = await db
    .select({
      fuelType: fuelPricesCurrent.fuelType,
      price: fuelPricesCurrent.price,
      stationPermitNumber: fuelPricesCurrent.stationPermitNumber,
      reportedAt: fuelPricesCurrent.reportedAt,
    })
    .from(fuelPricesCurrent)
    .where(locationWhere)
  const curatedRows = priceRows.filter(
    (row) => row.price >= MIN_PLAUSIBLE_PRICE && row.price <= MAX_PLAUSIBLE_PRICE,
  )
  const fuels: FuelType[] = ['regular', 'premium', 'diesel', 'duba']
  const metrics = fuels.map((fuel) => summarizeFuelPrices(curatedRows, fuel))
  const rawMetrics = fuels.map((fuel) => summarizeFuelPrices(priceRows, fuel))

  async function topRegular(rows: typeof priceRows) {
    const topPrices = rows
      .filter((row) => row.fuelType === 'regular')
      .sort(
        (a, b) =>
          a.price - b.price ||
          a.stationPermitNumber.localeCompare(b.stationPermitNumber),
      )
      .slice(0, 10)
    if (topPrices.length === 0) return []
    const stationRows = await db
      .select()
      .from(stations)
      .where(
        inArray(
          stations.permitNumber,
          topPrices.map((row) => row.stationPermitNumber),
        ),
      )
    const stationByPermit = new Map(
      stationRows.map((row) => [row.permitNumber, toPublicStation(row)]),
    )
    return topPrices.flatMap((price) => {
      const stationRow = stationByPermit.get(price.stationPermitNumber)
      return stationRow
        ? [
            {
              station: stationRow,
              price: price.price,
              ...(price.reportedAt
                ? { reportedAt: price.reportedAt.toISOString() }
                : {}),
            },
          ]
        : []
    })
  }

  const [curatedTopRegular, rawTopRegular, stationCountRows] = await Promise.all([
    topRegular(curatedRows),
    topRegular(priceRows),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(stations)
      .where(
        and(
          eq(stations.stateExternalId, state.externalId),
          municipality
            ? eq(stations.municipalityExternalId, municipality.externalId)
            : undefined,
        ),
      ),
  ])
  const municipalityCounts = new Map(
    nav.municipalities
      .filter((row) => row.stateExternalId === state.externalId)
      .map((row) => [row.externalId, row.count]),
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
    metrics,
    stationCount: stationCountRows[0]?.count ?? 0,
    topRegular: curatedTopRegular,
    views: {
      curated: { metrics, topRegular: curatedTopRegular },
      raw: { metrics: rawMetrics, topRegular: rawTopRegular },
    },
    priceBand: { min: MIN_PLAUSIBLE_PRICE, max: MAX_PLAUSIBLE_PRICE },
    excludedPriceRows: priceRows.length - curatedRows.length,
    states: nav.states.map((row) => ({
      ...row,
      slug: slugifyLocationName(row.name),
    })),
    municipalities: municipalityRows
      .map((row) => ({
        externalId: row.externalId,
        stateExternalId: row.stateExternalId,
        name: row.name,
        slug: slugifyLocationName(row.name),
        count: municipalityCounts.get(row.externalId) ?? 0,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }
}

export const drizzlePublicDataRepository = {
  readFilterOptions,
  readMetrics,
  readLatestPriceRun,
  readStationHistory,
  readStationDetail,
  readStationsByPermits,
  readBestNearby,
  readStationList,
  readStationsInBounds,
  readAreaBounds,
  readSeoLocationOverview,
  readSitemapLocations,
} satisfies PublicDataRepository
