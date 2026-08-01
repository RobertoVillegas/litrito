import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'

const TABLES = [
  'states',
  'municipalities',
  'locationBounds',
  'stations',
  'fuelPricesCurrent',
  'ingestionRuns',
  'fuelPricesHistory',
  'rawSnapshots',
  'filterOptionsCache',
  'metricsCache',
  'adminAuditEvents',
  'stationBrandAudits',
  'userRoles',
  'stationFavorites',
  'accountDeletions',
  'stationPhotos',
  'stationEnrichment',
  'stationListings',
] as const

type TableName = (typeof TABLES)[number]
type ConvexDocument = Record<string, unknown> & {
  _id: string
  _creationTime: number
}

const TABLE_SPEC: Record<
  TableName,
  { sqlName: string; columns: string[] }
> = {
  states: {
    sqlName: 'states',
    columns: ['id', 'convex_creation_time', 'external_id', 'name', 'updated_at'],
  },
  municipalities: {
    sqlName: 'municipalities',
    columns: [
      'id',
      'convex_creation_time',
      'external_id',
      'state_external_id',
      'name',
      'updated_at',
    ],
  },
  locationBounds: {
    sqlName: 'location_bounds',
    columns: [
      'id',
      'convex_creation_time',
      'key',
      'state_external_id',
      'municipality_external_id',
      'sw_lat',
      'sw_lon',
      'ne_lat',
      'ne_lon',
      'source',
      'updated_at',
    ],
  },
  stations: {
    sqlName: 'stations',
    columns: [
      'id',
      'convex_creation_time',
      'place_id',
      'permit_number',
      'name',
      'address',
      'state_external_id',
      'municipality_external_id',
      'state_name',
      'municipality_name',
      'latitude',
      'longitude',
      'lat_bucket',
      'coordinate_status',
      'coordinate_checked_at',
      'source',
      'first_seen_at',
      'last_seen_at',
    ],
  },
  fuelPricesCurrent: {
    sqlName: 'fuel_prices_current',
    columns: [
      'id',
      'convex_creation_time',
      'station_permit_number',
      'product',
      'subproduct',
      'fuel_type',
      'price',
      'currency',
      'unit',
      'state_external_id',
      'municipality_external_id',
      'reported_at',
      'ingested_at',
      'source',
    ],
  },
  fuelPricesHistory: {
    sqlName: 'fuel_prices_history',
    columns: [
      'id',
      'convex_creation_time',
      'station_permit_number',
      'product',
      'subproduct',
      'fuel_type',
      'price',
      'currency',
      'unit',
      'state_external_id',
      'municipality_external_id',
      'reported_at',
      'ingested_at',
      'source',
      'run_id',
    ],
  },
  ingestionRuns: {
    sqlName: 'ingestion_runs',
    columns: [
      'id',
      'convex_creation_time',
      'kind',
      'status',
      'started_at',
      'finished_at',
      'state_external_id',
      'municipality_external_id',
      'source_url',
      'message',
      'records_read',
      'records_written',
      'parent_run_id',
      'cursor',
      'failed_count',
      'new_stations',
      'heartbeat_at',
    ],
  },
  rawSnapshots: {
    sqlName: 'raw_snapshots',
    columns: [
      'id',
      'convex_creation_time',
      'kind',
      'source_url',
      'fetched_at',
      'content_length',
      'place_count',
      'price_count',
      'sample',
      'object_key',
      'run_id',
    ],
  },
  filterOptionsCache: {
    sqlName: 'filter_options_cache',
    columns: ['id', 'convex_creation_time', 'key', 'data', 'updated_at'],
  },
  metricsCache: {
    sqlName: 'metrics_cache',
    columns: ['id', 'convex_creation_time', 'key', 'data', 'updated_at'],
  },
  adminAuditEvents: {
    sqlName: 'admin_audit_events',
    columns: [
      'id',
      'convex_creation_time',
      'actor_user_id',
      'actor_email',
      'action',
      'target',
      'created_at',
      'status',
      'message',
      'run_id',
    ],
  },
  stationBrandAudits: {
    sqlName: 'station_brand_audits',
    columns: [
      'id',
      'convex_creation_time',
      'station_permit_number',
      'station_name',
      'station_address',
      'state_external_id',
      'municipality_external_id',
      'state_name',
      'municipality_name',
      'station_latitude',
      'station_longitude',
      'candidate_source',
      'candidate_id',
      'candidate_name',
      'candidate_brand',
      'candidate_operator',
      'candidate_latitude',
      'candidate_longitude',
      'candidate_distance_meters',
      'match_status',
      'accepted_brand',
      'confidence',
      'notes',
      'reviewed_by',
      'reviewed_at',
      'scanned_at',
      'updated_at',
    ],
  },
  userRoles: {
    sqlName: 'user_roles',
    columns: [
      'id',
      'convex_creation_time',
      'user_id',
      'email',
      'is_admin',
      'created_at',
      'updated_at',
    ],
  },
  stationFavorites: {
    sqlName: 'station_favorites',
    columns: [
      'id',
      'convex_creation_time',
      'user_id',
      'station_permit_number',
      'created_at',
    ],
  },
  accountDeletions: {
    sqlName: 'account_deletions',
    columns: [
      'id',
      'convex_creation_time',
      'auth_user_id',
      'email',
      'name',
      'requested_at',
      'scheduled_at',
    ],
  },
  stationPhotos: {
    sqlName: 'station_photos',
    columns: [
      'id',
      'convex_creation_time',
      'station_permit_number',
      'source',
      'status',
      'object_key',
      'legacy_storage_id',
      'mapillary_image_id',
      'attribution',
      'captured_at',
      'checked_at',
    ],
  },
  stationEnrichment: {
    sqlName: 'station_enrichment',
    columns: [
      'id',
      'convex_creation_time',
      'station_permit_number',
      'brand',
      'display_name',
      'source',
      'source_release',
      'source_id',
      'source_name',
      'match_distance_meters',
      'enriched_at',
    ],
  },
  stationListings: {
    sqlName: 'station_listings',
    columns: [
      'id',
      'convex_creation_time',
      'station_id',
      'permit_number',
      'name',
      'address',
      'state_external_id',
      'municipality_external_id',
      'state_name',
      'municipality_name',
      'latitude',
      'longitude',
      'lat_bucket',
      'first_seen_at',
      'regular_price',
      'premium_price',
      'diesel_price',
      'duba_price',
      'unknown_price',
      'prices',
      'enrichment',
      'updated_at',
    ],
  },
}

function camelToSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

export function normalizeDocument(table: TableName, document: ConvexDocument) {
  const row: Record<string, unknown> = {
    id: document._id,
    convex_creation_time: document._creationTime,
  }

  for (const [key, value] of Object.entries(document)) {
    if (key.startsWith('_')) continue
    const column = key === 'storageId' ? 'legacy_storage_id' : camelToSnake(key)
    row[column] = value
  }

  if (table === 'accountDeletions' && typeof row.scheduled_at === 'number') {
    row.scheduled_at = new Date(row.scheduled_at).toISOString()
  }
  if (
    (table === 'filterOptionsCache' || table === 'metricsCache') &&
    typeof row.data === 'string'
  ) {
    row.data = JSON.parse(row.data)
  }

  return row
}

export function copyCell(value: unknown): string {
  if (value === null || value === undefined) return String.raw`\N`
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', String.raw`\t`)
    .replaceAll('\n', String.raw`\n`)
    .replaceAll('\r', String.raw`\r`)
}

export function copyRow(columns: string[], row: Record<string, unknown>) {
  return `${columns.map((column) => copyCell(row[column])).join('\t')}\n`
}

function selectedTables(): TableName[] {
  const tableArg = process.argv.find((arg) => arg.startsWith('--tables='))
  if (!tableArg) return [...TABLES]
  const requested = tableArg
    .slice('--tables='.length)
    .split(',')
    .filter(Boolean)
  const unknown = requested.filter((table) => !TABLES.includes(table as TableName))
  if (unknown.length > 0) throw new Error(`Unknown tables: ${unknown.join(', ')}`)
  return requested as TableName[]
}

function argumentValue(name: string) {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

export async function* documentsFromSnapshot(snapshotPath: string, table: TableName) {
  const child = spawn('unzip', [
    '-p',
    snapshotPath,
    `${table}/documents.jsonl`,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (!child.stdout || !child.stderr) {
    throw new Error(`Could not read ${table} from snapshot`)
  }
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as ConvexDocument
  }
  const exitCode = await exit
  if (exitCode !== 0) {
    throw new Error(`Snapshot read failed for ${table}: ${stderr.trim()}`)
  }
}

async function main() {
  const snapshotPath = argumentValue('snapshot')
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  if (!snapshotPath) throw new Error('--snapshot=/ruta/export.zip is required')
  const sourceSnapshot = snapshotPath

  const truncate = process.argv.includes('--truncate')
  const sql = postgres(databaseUrl, {
    max: 2,
    idle_timeout: 10,
    connect_timeout: 10,
    connection: { application_name: 'litrito-convex-import' },
  })
  const summary: Array<{ table: TableName; source: number; postgres: number }> = []

  try {
    for (const table of selectedTables()) {
      const spec = TABLE_SPEC[table]
      let sourceCount = 0

      await sql.begin(async (transaction) => {
        const [{ count: existingCount }] = await transaction<[{ count: number }]>`
          select count(*)::int as count from ${transaction(spec.sqlName)}
        `
        if (existingCount > 0 && !truncate) {
          throw new Error(
            `${spec.sqlName} contains ${existingCount} rows; rerun with --truncate to replace them`,
          )
        }
        if (truncate) await transaction`truncate table ${transaction(spec.sqlName)}`

        async function* rows() {
          for await (const document of documentsFromSnapshot(sourceSnapshot, table)) {
            sourceCount += 1
            yield copyRow(spec.columns, normalizeDocument(table, document))
          }
        }

        const writable = await transaction`
          copy ${transaction(spec.sqlName)} (${transaction(spec.columns)}) from stdin
        `.writable()
        await pipeline(Readable.from(rows()), writable)

        const [{ count: postgresCount }] = await transaction<[{ count: number }]>`
          select count(*)::int as count from ${transaction(spec.sqlName)}
        `
        if (postgresCount !== sourceCount) {
          throw new Error(
            `${table}: Convex=${sourceCount}, PostgreSQL=${postgresCount}`,
          )
        }
        summary.push({ table, source: sourceCount, postgres: postgresCount })
      })
    }
  } finally {
    await sql.end({ timeout: 5 })
  }

  console.table(summary)
  console.log(`Validated ${summary.length} tables with matching row counts.`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main()
}
