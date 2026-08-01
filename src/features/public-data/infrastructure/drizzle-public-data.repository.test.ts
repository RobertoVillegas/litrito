import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase } from '#/db/client'
import {
  filterOptionsCache,
  fuelPricesCurrent,
  fuelPricesHistory,
  ingestionRuns,
  stationListings,
  stations,
} from '#/db/schema'
import {
  readBestNearby,
  readFilterOptions,
  readLatestPriceRun,
  readStationDetail,
  readStationList,
} from './drizzle-public-data.repository'

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip
const now = new Date('2026-07-31T06:00:00.000Z')

describeDatabase('PostgreSQL public reads', () => {
  beforeAll(async () => {
    const { db, sql } = getDatabase()
    await sql`truncate table fuel_prices_history, fuel_prices_current, station_listings, stations, ingestion_runs, filter_options_cache`
    await db.insert(filterOptionsCache).values({
      id: 'filters',
      key: 'default',
      data: {
        states: [{ externalId: '09', name: 'Ciudad de México', count: 2 }],
        municipalities: [],
      },
      updatedAt: now,
    })
    await db.insert(stations).values([
      {
        id: 'station-1',
        permitNumber: 'PL/1/EXP/ES/2015',
        name: 'Peméx Centro',
        address: 'Avenida Reforma 1',
        stateExternalId: '09',
        municipalityExternalId: '001',
        stateName: 'Ciudad de México',
        municipalityName: 'Centro',
        latitude: 19.4326,
        longitude: -99.1332,
        latBucket: 194,
        source: 'CNE',
        firstSeenAt: now,
        lastSeenAt: now,
      },
      {
        id: 'station-2',
        permitNumber: 'PL/2/EXP/ES/2015',
        name: 'Gasolinera Norte',
        address: 'Avenida Norte 2',
        stateExternalId: '09',
        municipalityExternalId: '001',
        stateName: 'Ciudad de México',
        municipalityName: 'Centro',
        latitude: 19.44,
        longitude: -99.14,
        latBucket: 194,
        source: 'CNE',
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ])
    await db.insert(stationListings).values([
      {
        id: 'listing-1',
        stationId: 'station-1',
        permitNumber: 'PL/1/EXP/ES/2015',
        name: 'Peméx Centro',
        address: 'Avenida Reforma 1',
        stateExternalId: '09',
        municipalityExternalId: '001',
        stateName: 'Ciudad de México',
        municipalityName: 'Centro',
        latitude: 19.4326,
        longitude: -99.1332,
        latBucket: 194,
        firstSeenAt: now,
        regularPrice: 23.1,
        prices: { regular: { price: 23.1, reportedAt: now.toISOString() } },
        updatedAt: now,
      },
      {
        id: 'listing-2',
        stationId: 'station-2',
        permitNumber: 'PL/2/EXP/ES/2015',
        name: 'Gasolinera Norte',
        address: 'Avenida Norte 2',
        stateExternalId: '09',
        municipalityExternalId: '001',
        stateName: 'Ciudad de México',
        municipalityName: 'Centro',
        latitude: 19.44,
        longitude: -99.14,
        latBucket: 194,
        firstSeenAt: now,
        regularPrice: 22.5,
        prices: { regular: { price: 22.5, reportedAt: now.toISOString() } },
        updatedAt: now,
      },
    ])
    await db.insert(ingestionRuns).values({
      id: 'run-1',
      kind: 'municipality_prices',
      status: 'success',
      startedAt: now,
      finishedAt: now,
      recordsRead: 2,
      recordsWritten: 2,
    })
    await db.insert(fuelPricesCurrent).values({
      id: 'current-1',
      stationPermitNumber: 'PL/1/EXP/ES/2015',
      product: 'Gasolina',
      subproduct: 'Regular',
      fuelType: 'regular',
      price: 23.1,
      stateExternalId: '09',
      municipalityExternalId: '001',
      reportedAt: now,
      ingestedAt: now,
    })
    await db.insert(fuelPricesHistory).values({
      id: 'history-1',
      stationPermitNumber: 'PL/1/EXP/ES/2015',
      product: 'Gasolina',
      subproduct: 'Regular',
      fuelType: 'regular',
      price: 23.1,
      stateExternalId: '09',
      municipalityExternalId: '001',
      reportedAt: now,
      ingestedAt: now,
      runId: 'run-1',
    })
  })

  afterAll(closeDatabase)

  it('serves cached filters', async () => {
    const filters = await readFilterOptions()
    expect(filters.states[0]).toMatchObject({ externalId: '09', count: 2 })
  })

  it('uses accent-insensitive trigrams for station search', async () => {
    const result = await readStationList({
      search: 'Pemex Centro',
      sortMode: 'name',
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(result.page.map((row) => row.station.permitNumber)).toEqual([
      'PL/1/EXP/ES/2015',
    ])
  })

  it('filters listings by their available fuel JSON on PostgreSQL 18', async () => {
    const result = await readStationList({
      fuelTypes: ['regular', 'premium'],
      sortMode: 'price',
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(result.page.map((row) => row.station.permitNumber)).toEqual([
      'PL/2/EXP/ES/2015',
      'PL/1/EXP/ES/2015',
    ])
  })

  it('ranks nearby stations by price then distance', async () => {
    const result = await readBestNearby({
      fuelType: 'regular',
      userLocation: { latitude: 19.4326, longitude: -99.1332 },
      maxDistanceKm: 5,
      limit: 2,
    })
    expect(result.map((row) => row.station.permitNumber)).toEqual([
      'PL/2/EXP/ES/2015',
      'PL/1/EXP/ES/2015',
    ])
  })

  it('returns current/history detail and the indexed latest run', async () => {
    const [detail, latestRun] = await Promise.all([
      readStationDetail('PL/1/EXP/ES/2015'),
      readLatestPriceRun(),
    ])
    expect(detail?.currentPrices.regular.price).toBe(23.1)
    expect(detail?.history).toHaveLength(1)
    expect(latestRun?._id).toBe('run-1')
  })
})
