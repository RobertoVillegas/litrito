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
    // Coarse latitude bucket (floor(lat/0.1)) for the 2D nearby search; paired
    // with longitude so a radius query reads only the cells around the user.
    latBucket: v.optional(v.number()),
    coordinateStatus: v.optional(
      v.union(v.literal('pending'), v.literal('located'), v.literal('failed')),
    ),
    coordinateCheckedAt: v.optional(v.string()),
    source: v.literal('CNE'),
    firstSeenAt: v.string(),
    lastSeenAt: v.string(),
  })
    .index('by_permit', ['permitNumber'])
    .index('by_location', ['stateExternalId', 'municipalityExternalId'])
    .index('by_state', ['stateExternalId'])
    .index('by_name', ['name'])
    .index('by_lat', ['latitude'])
    .index('by_lat_lon', ['latBucket', 'longitude'])
    .index('by_coordinate_status', ['coordinateStatus'])
    .index('by_coordinate_status_checked', [
      'coordinateStatus',
      'coordinateCheckedAt',
    ])
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
    parentRunId: v.optional(v.id('ingestionRuns')),
    cursor: v.optional(v.union(v.string(), v.null())),
    failedCount: v.optional(v.number()),
    newStations: v.optional(v.number()),
    heartbeatAt: v.optional(v.string()),
  })
    .index('by_kind_started', ['kind', 'startedAt'])
    .index('by_kind_status_started', ['kind', 'status', 'startedAt'])
    .index('by_parent', ['parentRunId'])
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
  // Brand / display-name enrichment from EXTERNAL sources (Overture, Foursquare,
  // OSM, manual). Kept entirely separate from the CNE station record — it never
  // overwrites stations.name (the CNE razón social, the source of truth). Each
  // row documents where the value came from (source + dataset release + raw POI
  // id/name) and how it was matched (distance) for full traceability.
  stationEnrichment: defineTable({
    stationPermitNumber: v.string(),
    brand: v.optional(v.string()),
    displayName: v.optional(v.string()),
    source: v.union(
      v.literal('overture'),
      v.literal('foursquare'),
      v.literal('osm'),
      v.literal('legal_name'),
      v.literal('manual'),
    ),
    sourceRelease: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    matchDistanceMeters: v.optional(v.number()),
    enrichedAt: v.string(),
  })
    .index('by_station', ['stationPermitNumber'])
    .index('by_brand', ['brand']),
  // Read-optimized projection used by maps and station lists. Source tables
  // remain authoritative; this document removes station/price/enrichment N+1
  // joins from hot public queries.
  stationListings: defineTable({
    stationId: v.id('stations'),
    permitNumber: v.string(),
    name: v.string(),
    address: v.string(),
    stateExternalId: v.string(),
    municipalityExternalId: v.string(),
    stateName: v.optional(v.string()),
    municipalityName: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    latBucket: v.optional(v.number()),
    firstSeenAt: v.string(),
    regularPrice: v.optional(v.number()),
    premiumPrice: v.optional(v.number()),
    dieselPrice: v.optional(v.number()),
    dubaPrice: v.optional(v.number()),
    unknownPrice: v.optional(v.number()),
    prices: v.object({
      regular: v.optional(v.object({ price: v.number(), reportedAt: v.optional(v.string()) })),
      premium: v.optional(v.object({ price: v.number(), reportedAt: v.optional(v.string()) })),
      diesel: v.optional(v.object({ price: v.number(), reportedAt: v.optional(v.string()) })),
      duba: v.optional(v.object({ price: v.number(), reportedAt: v.optional(v.string()) })),
      unknown: v.optional(v.object({ price: v.number(), reportedAt: v.optional(v.string()) })),
    }),
    enrichment: v.optional(
      v.object({
        brand: v.union(v.string(), v.null()),
        displayName: v.union(v.string(), v.null()),
        source: v.string(),
      }),
    ),
    updatedAt: v.string(),
  })
    .index('by_permit', ['permitNumber'])
    .index('by_location', ['stateExternalId', 'municipalityExternalId'])
    .index('by_state', ['stateExternalId'])
    .index('by_name', ['name'])
    .index('by_lat_lon', ['latBucket', 'longitude'])
    .index('by_regular_price', ['regularPrice'])
    .index('by_premium_price', ['premiumPrice'])
    .index('by_diesel_price', ['dieselPrice'])
    .index('by_duba_price', ['dubaPrice'])
    .index('by_unknown_price', ['unknownPrice'])
    .index('by_state_regular_price', ['stateExternalId', 'regularPrice'])
    .index('by_state_premium_price', ['stateExternalId', 'premiumPrice'])
    .index('by_state_diesel_price', ['stateExternalId', 'dieselPrice'])
    .index('by_state_duba_price', ['stateExternalId', 'dubaPrice'])
    .index('by_state_unknown_price', ['stateExternalId', 'unknownPrice'])
    .index('by_location_regular_price', [
      'stateExternalId',
      'municipalityExternalId',
      'regularPrice',
    ])
    .index('by_location_premium_price', [
      'stateExternalId',
      'municipalityExternalId',
      'premiumPrice',
    ])
    .index('by_location_diesel_price', [
      'stateExternalId',
      'municipalityExternalId',
      'dieselPrice',
    ])
    .index('by_location_duba_price', [
      'stateExternalId',
      'municipalityExternalId',
      'dubaPrice',
    ])
    .index('by_location_unknown_price', [
      'stateExternalId',
      'municipalityExternalId',
      'unknownPrice',
    ])
    .searchIndex('search_station', {
      searchField: 'name',
      filterFields: ['stateExternalId', 'municipalityExternalId'],
    }),
})
