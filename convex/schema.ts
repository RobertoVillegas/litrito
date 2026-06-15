import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  adminAuditActionValidator,
  adminAuditStatusValidator,
  fuelTypeValidator,
  ingestionRunKindValidator,
  runStatusValidator,
} from './validators'

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
  locationBounds: defineTable({
    key: v.string(),
    stateExternalId: v.string(),
    municipalityExternalId: v.optional(v.string()),
    swLat: v.number(),
    swLon: v.number(),
    neLat: v.number(),
    neLon: v.number(),
    source: v.string(),
    updatedAt: v.string(),
  })
    .index('by_key', ['key'])
    .index('by_state', ['stateExternalId']),
  stations: defineTable({
    placeId: v.optional(v.string()),
    permitNumber: v.string(),
    name: v.string(),
    address: v.string(),
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
    stateName: v.optional(v.string()),
    municipalityName: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    source: v.literal('CNE'),
    firstSeenAt: v.string(),
    lastSeenAt: v.string(),
  })
    .index('by_permit', ['permitNumber'])
    .index('by_location', ['stateExternalId', 'municipalityExternalId'])
    .index('by_state', ['stateExternalId'])
    .index('by_name', ['name'])
    .index('by_lat', ['latitude'])
    .searchIndex('search_station', {
      searchField: 'name',
      filterFields: ['stateExternalId', 'municipalityExternalId'],
    }),
  fuelPricesCurrent: defineTable({
    stationPermitNumber: v.string(),
    product: v.string(),
    subproduct: v.string(),
    fuelType: fuelTypeValidator,
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
    .index('by_fuel_price', ['fuelType', 'price'])
    .index('by_state_fuel_price', ['stateExternalId', 'fuelType', 'price'])
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
    fuelType: fuelTypeValidator,
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
    kind: ingestionRunKindValidator,
    status: runStatusValidator,
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
    kind: v.union(v.literal('cne_prices_xml'), v.literal('cne_places_xml')),
    sourceUrl: v.string(),
    fetchedAt: v.string(),
    contentLength: v.number(),
    placeCount: v.number(),
    priceCount: v.number(),
    sample: v.string(),
    runId: v.id('ingestionRuns'),
  }).index('by_fetched_at', ['fetchedAt']),
  filterOptionsCache: defineTable({
    key: v.string(),
    data: v.string(),
    updatedAt: v.string(),
  }).index('by_key', ['key']),
  metricsCache: defineTable({
    key: v.string(),
    data: v.string(),
    updatedAt: v.string(),
  }).index('by_key', ['key']),
  adminAuditEvents: defineTable({
    actorUserId: v.string(),
    actorEmail: v.optional(v.string()),
    action: adminAuditActionValidator,
    target: v.string(),
    createdAt: v.string(),
    status: adminAuditStatusValidator,
    message: v.optional(v.string()),
    runId: v.optional(v.string()),
  })
    .index('by_created_at', ['createdAt'])
    .index('by_actor', ['actorUserId']),
  userRoles: defineTable({
    userId: v.string(),
    email: v.string(),
    isAdmin: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_user_id', ['userId'])
    .index('by_email', ['email']),
  stationFavorites: defineTable({
    userId: v.string(),
    stationPermitNumber: v.string(),
    createdAt: v.string(),
  })
    .index('by_user', ['userId'])
    .index('by_user_station', ['userId', 'stationPermitNumber']),
})
