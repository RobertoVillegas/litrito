import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  states: defineTable({
    externalId: v.string(),
    name: v.string(),
    updatedAt: v.string(),
  }).index('by_external_id', ['externalId']),
  municipalities: defineTable({
    externalId: v.string(),
    stateExternalId: v.string(),
    name: v.string(),
    updatedAt: v.string(),
  })
    .index('by_external_id', ['stateExternalId', 'externalId'])
    .index('by_state', ['stateExternalId']),
  stations: defineTable({
    permitNumber: v.string(),
    name: v.string(),
    address: v.string(),
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
    stateName: v.optional(v.string()),
    municipalityName: v.optional(v.string()),
    source: v.literal('CNE'),
    firstSeenAt: v.string(),
    lastSeenAt: v.string(),
  })
    .index('by_permit', ['permitNumber'])
    .index('by_location', ['stateExternalId', 'municipalityExternalId'])
    .searchIndex('search_station', {
      searchField: 'name',
      filterFields: ['stateExternalId', 'municipalityExternalId'],
    }),
  fuelPricesCurrent: defineTable({
    stationPermitNumber: v.string(),
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
    currency: v.literal('MXN'),
    unit: v.literal('litro'),
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
    reportedAt: v.optional(v.string()),
    ingestedAt: v.string(),
    source: v.literal('CNE'),
  })
    .index('by_station_fuel', ['stationPermitNumber', 'fuelType'])
    .index('by_location_fuel_price', [
      'stateExternalId',
      'municipalityExternalId',
      'fuelType',
      'price',
    ]),
  fuelPricesHistory: defineTable({
    stationPermitNumber: v.string(),
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
    currency: v.literal('MXN'),
    unit: v.literal('litro'),
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
    reportedAt: v.optional(v.string()),
    ingestedAt: v.string(),
    source: v.literal('CNE'),
    runId: v.id('ingestionRuns'),
  })
    .index('by_station', ['stationPermitNumber'])
    .index('by_run', ['runId']),
  ingestionRuns: defineTable({
    kind: v.union(
      v.literal('catalog'),
      v.literal('municipality_prices'),
      v.literal('xml_snapshot'),
      v.literal('daily_queue'),
    ),
    status: v.union(
      v.literal('running'),
      v.literal('success'),
      v.literal('failed'),
      v.literal('skipped'),
    ),
    startedAt: v.string(),
    finishedAt: v.optional(v.string()),
    stateExternalId: v.optional(v.string()),
    municipalityExternalId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    message: v.optional(v.string()),
    recordsRead: v.optional(v.number()),
    recordsWritten: v.optional(v.number()),
  })
    .index('by_kind_started', ['kind', 'startedAt'])
    .index('by_location', ['stateExternalId', 'municipalityExternalId']),
  rawSnapshots: defineTable({
    kind: v.literal('cne_prices_xml'),
    sourceUrl: v.string(),
    fetchedAt: v.string(),
    contentLength: v.number(),
    placeCount: v.number(),
    priceCount: v.number(),
    sample: v.string(),
    runId: v.id('ingestionRuns'),
  }).index('by_fetched_at', ['fetchedAt']),
})
