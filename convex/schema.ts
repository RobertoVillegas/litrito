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
  stationBrandAudits: defineTable({
    stationPermitNumber: v.string(),
    stationName: v.string(),
    stationAddress: v.string(),
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
    stateName: v.optional(v.string()),
    municipalityName: v.optional(v.string()),
    stationLatitude: v.optional(v.number()),
    stationLongitude: v.optional(v.number()),
    candidateSource: v.union(v.literal('osm'), v.literal('google_places'), v.literal('manual')),
    candidateId: v.optional(v.string()),
    candidateName: v.optional(v.string()),
    candidateBrand: v.optional(v.string()),
    candidateOperator: v.optional(v.string()),
    candidateLatitude: v.optional(v.number()),
    candidateLongitude: v.optional(v.number()),
    candidateDistanceMeters: v.optional(v.number()),
    matchStatus: v.union(
      v.literal('accepted'),
      v.literal('review_nearby_not_accepted'),
      v.literal('no_match'),
      v.literal('manual_override'),
      v.literal('rejected'),
    ),
    acceptedBrand: v.optional(v.string()),
    confidence: v.union(v.literal('high'), v.literal('review'), v.literal('none')),
    notes: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
    scannedAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_station', ['stationPermitNumber'])
    .index('by_location', ['stateExternalId', 'municipalityExternalId'])
    .index('by_status', ['matchStatus'])
    .index('by_updated_at', ['updatedAt']),
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
  // Self-service account deletion requests, held during a grace period before a
  // daily cron purges the user. authUserId is the Better Auth user `_id` string.
  accountDeletions: defineTable({
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    requestedAt: v.string(),
    scheduledAt: v.number(), // epoch ms; cron purges once now >= scheduledAt
  })
    .index('by_user', ['authUserId'])
    .index('by_scheduled', ['scheduledAt']),
  // One cached photo per station. Filled lazily on first view: we look up a
  // street-level image near the station's coordinates from Mapillary (free) and
  // store the thumbnail in Convex storage so later views don't re-hit the API or
  // depend on expiring CDN URLs. `status: 'none'` records that we checked and
  // found no coverage, so we don't keep retrying.
  stationPhotos: defineTable({
    stationPermitNumber: v.string(),
    source: v.literal('mapillary'),
    status: v.union(v.literal('found'), v.literal('none')),
    storageId: v.optional(v.id('_storage')),
    mapillaryImageId: v.optional(v.string()),
    attribution: v.optional(v.string()),
    capturedAt: v.optional(v.string()),
    checkedAt: v.string(),
  }).index('by_station', ['stationPermitNumber']),
})
