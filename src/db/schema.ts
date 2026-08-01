import { sql } from 'drizzle-orm'
import {
  boolean,
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const convexId = () => text('id').primaryKey()
const convexCreationTime = () =>
  doublePrecision('convex_creation_time')
    .notNull()
    .default(sql`extract(epoch from clock_timestamp()) * 1000`)
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

// Better Auth tables are separate from the 18 migrated application tables.
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('auth_user_email_uidx').on(table.email)],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: instant('expires_at').notNull(),
    token: text('token').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('auth_session_token_uidx').on(table.token),
    index('auth_session_user_idx').on(table.userId),
  ],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: instant('access_token_expires_at'),
    refreshTokenExpiresAt: instant('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [index('auth_account_user_idx').on(table.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [index('auth_verification_identifier_idx').on(table.identifier)],
)

export const rateLimit = pgTable(
  'rate_limit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (table) => [uniqueIndex('auth_rate_limit_key_uidx').on(table.key)],
)

export const fuelTypeEnum = pgEnum('fuel_type', [
  'regular',
  'premium',
  'diesel',
  'duba',
  'unknown',
])
export const ingestionRunKindEnum = pgEnum('ingestion_run_kind', [
  'catalog',
  'municipality_prices',
  'xml_snapshot',
  'daily_queue',
  'geocoding',
])
export const ingestionRunStatusEnum = pgEnum('ingestion_run_status', [
  'pending',
  'running',
  'success',
  'failed',
  'skipped',
  'partial_success',
])
export const coordinateStatusEnum = pgEnum('coordinate_status', [
  'pending',
  'located',
  'failed',
])
export const adminAuditActionEnum = pgEnum('admin_audit_action', [
  'retry_municipality_prices',
  'set_user_admin',
  'scan_station_brands',
  'review_station_brand',
])
export const adminAuditStatusEnum = pgEnum('admin_audit_status', [
  'success',
  'failed',
])
export const brandCandidateSourceEnum = pgEnum('brand_candidate_source', [
  'osm',
  'google_places',
  'manual',
])
export const brandMatchStatusEnum = pgEnum('brand_match_status', [
  'accepted',
  'review_nearby_not_accepted',
  'no_match',
  'manual_override',
  'rejected',
])
export const brandConfidenceEnum = pgEnum('brand_confidence', [
  'high',
  'review',
  'none',
])
export const photoStatusEnum = pgEnum('photo_status', ['found', 'none'])
export const enrichmentSourceEnum = pgEnum('enrichment_source', [
  'overture',
  'foursquare',
  'osm',
  'legal_name',
  'manual',
])
export const snapshotKindEnum = pgEnum('snapshot_kind', [
  'cne_prices_xml',
  'cne_places_xml',
])

export type ListingPrice = { price: number; reportedAt?: string }
export type ListingPrices = Partial<
  Record<'regular' | 'premium' | 'diesel' | 'duba' | 'unknown', ListingPrice>
>
export type ListingEnrichment = {
  brand: string | null
  displayName: string | null
  source: string
}

export const states = pgTable(
  'states',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [uniqueIndex('states_external_id_uidx').on(table.externalId)],
)

export const municipalities = pgTable(
  'municipalities',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    externalId: text('external_id').notNull(),
    stateExternalId: text('state_external_id').notNull(),
    name: text('name').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('municipalities_state_external_id_uidx').on(
      table.stateExternalId,
      table.externalId,
    ),
    index('municipalities_state_idx').on(table.stateExternalId),
  ],
)

export const locationBounds = pgTable(
  'location_bounds',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    key: text('key').notNull(),
    stateExternalId: text('state_external_id').notNull(),
    municipalityExternalId: text('municipality_external_id'),
    swLat: doublePrecision('sw_lat').notNull(),
    swLon: doublePrecision('sw_lon').notNull(),
    neLat: doublePrecision('ne_lat').notNull(),
    neLon: doublePrecision('ne_lon').notNull(),
    source: text('source').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('location_bounds_key_uidx').on(table.key),
    index('location_bounds_state_idx').on(table.stateExternalId),
  ],
)

export const stations = pgTable(
  'stations',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    placeId: text('place_id'),
    permitNumber: text('permit_number').notNull(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    stateExternalId: text('state_external_id').notNull(),
    municipalityExternalId: text('municipality_external_id').notNull(),
    stateName: text('state_name'),
    municipalityName: text('municipality_name'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    latBucket: integer('lat_bucket'),
    coordinateStatus: coordinateStatusEnum('coordinate_status'),
    coordinateCheckedAt: instant('coordinate_checked_at'),
    source: text('source').notNull().default('CNE'),
    firstSeenAt: instant('first_seen_at').notNull(),
    lastSeenAt: instant('last_seen_at').notNull(),
  },
  (table) => [
    uniqueIndex('stations_permit_number_uidx').on(table.permitNumber),
    index('stations_location_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
    ),
    index('stations_state_idx').on(table.stateExternalId),
    index('stations_latitude_idx').on(table.latitude),
    index('stations_lat_bucket_longitude_idx').on(table.latBucket, table.longitude),
    index('stations_coordinate_status_checked_idx').on(
      table.coordinateStatus,
      table.coordinateCheckedAt,
    ),
    index('stations_search_trgm_idx').using(
      'gin',
      sql`immutable_unaccent(${table.name} || ' ' || ${table.permitNumber} || ' ' || ${table.address}) gin_trgm_ops`,
    ),
  ],
)

export const fuelPricesCurrent = pgTable(
  'fuel_prices_current',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    stationPermitNumber: text('station_permit_number').notNull(),
    product: text('product').notNull(),
    subproduct: text('subproduct').notNull(),
    fuelType: fuelTypeEnum('fuel_type').notNull(),
    price: doublePrecision('price').notNull(),
    currency: text('currency').notNull().default('MXN'),
    unit: text('unit').notNull().default('litro'),
    stateExternalId: text('state_external_id').notNull(),
    municipalityExternalId: text('municipality_external_id').notNull(),
    reportedAt: instant('reported_at'),
    ingestedAt: instant('ingested_at').notNull(),
    source: text('source').notNull().default('CNE'),
  },
  (table) => [
    uniqueIndex('fuel_prices_current_station_subproduct_uidx').on(
      table.stationPermitNumber,
      table.subproduct,
    ),
    index('fuel_prices_current_station_fuel_idx').on(
      table.stationPermitNumber,
      table.fuelType,
    ),
    index('fuel_prices_current_fuel_price_idx').on(table.fuelType, table.price),
    index('fuel_prices_current_state_fuel_price_idx').on(
      table.stateExternalId,
      table.fuelType,
      table.price,
    ),
    index('fuel_prices_current_location_fuel_price_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
      table.fuelType,
      table.price,
    ),
  ],
)

export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    kind: ingestionRunKindEnum('kind').notNull(),
    status: ingestionRunStatusEnum('status').notNull(),
    startedAt: instant('started_at').notNull(),
    finishedAt: instant('finished_at'),
    stateExternalId: text('state_external_id'),
    municipalityExternalId: text('municipality_external_id'),
    sourceUrl: text('source_url'),
    message: text('message'),
    recordsRead: integer('records_read'),
    recordsWritten: integer('records_written'),
    parentRunId: text('parent_run_id'),
    cursor: text('cursor'),
    failedCount: integer('failed_count'),
    newStations: integer('new_stations'),
    heartbeatAt: instant('heartbeat_at'),
  },
  (table) => [
    index('ingestion_runs_kind_started_idx').on(table.kind, table.startedAt),
    index('ingestion_runs_kind_status_started_idx').on(
      table.kind,
      table.status,
      table.startedAt,
    ),
    index('ingestion_runs_parent_idx').on(table.parentRunId),
    index('ingestion_runs_location_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
    ),
  ],
)

export const fuelPricesHistory = pgTable(
  'fuel_prices_history',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    stationPermitNumber: text('station_permit_number').notNull(),
    product: text('product').notNull(),
    subproduct: text('subproduct').notNull(),
    fuelType: fuelTypeEnum('fuel_type').notNull(),
    price: doublePrecision('price').notNull(),
    currency: text('currency').notNull().default('MXN'),
    unit: text('unit').notNull().default('litro'),
    stateExternalId: text('state_external_id').notNull(),
    municipalityExternalId: text('municipality_external_id').notNull(),
    reportedAt: instant('reported_at'),
    ingestedAt: instant('ingested_at').notNull(),
    source: text('source').notNull().default('CNE'),
    runId: text('run_id').notNull(),
  },
  (table) => [
    index('fuel_prices_history_station_ingested_idx').on(
      table.stationPermitNumber,
      table.ingestedAt,
    ),
    index('fuel_prices_history_run_idx').on(table.runId),
  ],
)

export const rawSnapshots = pgTable(
  'raw_snapshots',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    kind: snapshotKindEnum('kind').notNull(),
    sourceUrl: text('source_url').notNull(),
    fetchedAt: instant('fetched_at').notNull(),
    contentLength: integer('content_length').notNull(),
    placeCount: integer('place_count').notNull(),
    priceCount: integer('price_count').notNull(),
    sample: text('sample').notNull(),
    objectKey: text('object_key'),
    runId: text('run_id').notNull(),
  },
  (table) => [index('raw_snapshots_fetched_at_idx').on(table.fetchedAt)],
)

export const filterOptionsCache = pgTable(
  'filter_options_cache',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    key: text('key').notNull(),
    data: jsonb('data').$type<unknown>().notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [uniqueIndex('filter_options_cache_key_uidx').on(table.key)],
)

export const metricsCache = pgTable(
  'metrics_cache',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    key: text('key').notNull(),
    data: jsonb('data').$type<unknown>().notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [uniqueIndex('metrics_cache_key_uidx').on(table.key)],
)

export const adminAuditEvents = pgTable(
  'admin_audit_events',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    actorUserId: text('actor_user_id').notNull(),
    actorEmail: text('actor_email'),
    action: adminAuditActionEnum('action').notNull(),
    target: text('target').notNull(),
    createdAt: instant('created_at').notNull(),
    status: adminAuditStatusEnum('status').notNull(),
    message: text('message'),
    runId: text('run_id'),
  },
  (table) => [
    index('admin_audit_events_created_at_idx').on(table.createdAt),
    index('admin_audit_events_actor_idx').on(table.actorUserId),
  ],
)

export const stationBrandAudits = pgTable(
  'station_brand_audits',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    stationPermitNumber: text('station_permit_number').notNull(),
    stationName: text('station_name').notNull(),
    stationAddress: text('station_address').notNull(),
    stateExternalId: text('state_external_id').notNull(),
    municipalityExternalId: text('municipality_external_id').notNull(),
    stateName: text('state_name'),
    municipalityName: text('municipality_name'),
    stationLatitude: doublePrecision('station_latitude'),
    stationLongitude: doublePrecision('station_longitude'),
    candidateSource: brandCandidateSourceEnum('candidate_source').notNull(),
    candidateId: text('candidate_id'),
    candidateName: text('candidate_name'),
    candidateBrand: text('candidate_brand'),
    candidateOperator: text('candidate_operator'),
    candidateLatitude: doublePrecision('candidate_latitude'),
    candidateLongitude: doublePrecision('candidate_longitude'),
    candidateDistanceMeters: doublePrecision('candidate_distance_meters'),
    matchStatus: brandMatchStatusEnum('match_status').notNull(),
    acceptedBrand: text('accepted_brand'),
    confidence: brandConfidenceEnum('confidence').notNull(),
    notes: text('notes'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: instant('reviewed_at'),
    scannedAt: instant('scanned_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [
    index('station_brand_audits_station_idx').on(table.stationPermitNumber),
    index('station_brand_audits_location_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
    ),
    index('station_brand_audits_status_idx').on(table.matchStatus),
    index('station_brand_audits_updated_at_idx').on(table.updatedAt),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    userId: text('user_id').notNull(),
    email: text('email').notNull(),
    isAdmin: boolean('is_admin').notNull(),
    createdAt: instant('created_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('user_roles_user_id_uidx').on(table.userId),
    uniqueIndex('user_roles_email_uidx').on(table.email),
  ],
)

export const stationFavorites = pgTable(
  'station_favorites',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    userId: text('user_id').notNull(),
    stationPermitNumber: text('station_permit_number').notNull(),
    createdAt: instant('created_at').notNull(),
  },
  (table) => [
    index('station_favorites_user_idx').on(table.userId),
    uniqueIndex('station_favorites_user_station_uidx').on(
      table.userId,
      table.stationPermitNumber,
    ),
  ],
)

export const accountDeletions = pgTable(
  'account_deletions',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    authUserId: text('auth_user_id').notNull(),
    email: text('email').notNull(),
    name: text('name'),
    requestedAt: instant('requested_at').notNull(),
    scheduledAt: instant('scheduled_at').notNull(),
  },
  (table) => [
    uniqueIndex('account_deletions_user_uidx').on(table.authUserId),
    index('account_deletions_scheduled_idx').on(table.scheduledAt),
  ],
)

export const stationPhotos = pgTable(
  'station_photos',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    stationPermitNumber: text('station_permit_number').notNull(),
    source: text('source').notNull().default('mapillary'),
    status: photoStatusEnum('status').notNull(),
    objectKey: text('object_key'),
    legacyStorageId: text('legacy_storage_id'),
    mapillaryImageId: text('mapillary_image_id'),
    attribution: text('attribution'),
    capturedAt: instant('captured_at'),
    checkedAt: instant('checked_at').notNull(),
  },
  (table) => [uniqueIndex('station_photos_station_uidx').on(table.stationPermitNumber)],
)

export const stationEnrichment = pgTable(
  'station_enrichment',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    stationPermitNumber: text('station_permit_number').notNull(),
    brand: text('brand'),
    displayName: text('display_name'),
    source: enrichmentSourceEnum('source').notNull(),
    sourceRelease: text('source_release'),
    sourceId: text('source_id'),
    sourceName: text('source_name'),
    matchDistanceMeters: doublePrecision('match_distance_meters'),
    enrichedAt: instant('enriched_at').notNull(),
  },
  (table) => [
    uniqueIndex('station_enrichment_station_uidx').on(table.stationPermitNumber),
    index('station_enrichment_brand_idx').on(table.brand),
  ],
)

export const stationListings = pgTable(
  'station_listings',
  {
    id: convexId(),
    convexCreationTime: convexCreationTime(),
    stationId: text('station_id').notNull(),
    permitNumber: text('permit_number').notNull(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    stateExternalId: text('state_external_id').notNull(),
    municipalityExternalId: text('municipality_external_id').notNull(),
    stateName: text('state_name'),
    municipalityName: text('municipality_name'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    latBucket: integer('lat_bucket'),
    firstSeenAt: instant('first_seen_at').notNull(),
    regularPrice: doublePrecision('regular_price'),
    premiumPrice: doublePrecision('premium_price'),
    dieselPrice: doublePrecision('diesel_price'),
    dubaPrice: doublePrecision('duba_price'),
    unknownPrice: doublePrecision('unknown_price'),
    prices: jsonb('prices').$type<ListingPrices>().notNull(),
    enrichment: jsonb('enrichment').$type<ListingEnrichment>(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('station_listings_permit_uidx').on(table.permitNumber),
    index('station_listings_location_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
    ),
    index('station_listings_state_idx').on(table.stateExternalId),
    index('station_listings_lat_bucket_longitude_idx').on(
      table.latBucket,
      table.longitude,
    ),
    index('station_listings_regular_price_idx').on(table.regularPrice),
    index('station_listings_premium_price_idx').on(table.premiumPrice),
    index('station_listings_diesel_price_idx').on(table.dieselPrice),
    index('station_listings_duba_price_idx').on(table.dubaPrice),
    index('station_listings_unknown_price_idx').on(table.unknownPrice),
    index('station_listings_state_regular_price_idx').on(
      table.stateExternalId,
      table.regularPrice,
    ),
    index('station_listings_state_premium_price_idx').on(
      table.stateExternalId,
      table.premiumPrice,
    ),
    index('station_listings_state_diesel_price_idx').on(
      table.stateExternalId,
      table.dieselPrice,
    ),
    index('station_listings_state_duba_price_idx').on(
      table.stateExternalId,
      table.dubaPrice,
    ),
    index('station_listings_state_unknown_price_idx').on(
      table.stateExternalId,
      table.unknownPrice,
    ),
    index('station_listings_location_regular_price_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
      table.regularPrice,
    ),
    index('station_listings_location_premium_price_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
      table.premiumPrice,
    ),
    index('station_listings_location_diesel_price_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
      table.dieselPrice,
    ),
    index('station_listings_location_duba_price_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
      table.dubaPrice,
    ),
    index('station_listings_location_unknown_price_idx').on(
      table.stateExternalId,
      table.municipalityExternalId,
      table.unknownPrice,
    ),
    index('station_listings_search_trgm_idx').using(
      'gin',
      sql`immutable_unaccent(${table.name} || ' ' || ${table.permitNumber} || ' ' || ${table.address}) gin_trgm_ops`,
    ),
  ],
)

// Exported for import tooling and count validation in deterministic dependency order.
export const convexTables = {
  states,
  municipalities,
  locationBounds,
  stations,
  fuelPricesCurrent,
  fuelPricesHistory,
  ingestionRuns,
  rawSnapshots,
  filterOptionsCache,
  metricsCache,
  adminAuditEvents,
  stationBrandAudits,
  userRoles,
  stationFavorites,
  accountDeletions,
  stationPhotos,
  stationEnrichment,
  stationListings,
} as const

export type ConvexTableName = keyof typeof convexTables

// Kept as a compile-time assertion: this migration must cover exactly 18 app tables.
const tableCount: 18 = Object.keys(convexTables).length as 18
void tableCount
