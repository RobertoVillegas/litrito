#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const FORMAT = (process.argv[2] ?? 'json').toLowerCase()
const OUT_DIR = resolve(ROOT, 'data')
const DATE = new Date().toISOString().replace(/[:.]/g, '-')

function escapeCsv(value) {
  if (value == null) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(payload) {
  const fuelTypes = ['regular', 'premium', 'diesel', 'duba', 'unknown']
  const header = [
    'permitNumber',
    'name',
    'address',
    'stateExternalId',
    'stateName',
    'municipalityExternalId',
    'municipalityName',
    'latitude',
    'longitude',
    'source',
    'firstSeenAt',
    'lastSeenAt',
    ...fuelTypes.map((f) => `price_${f}`),
    ...fuelTypes.map((f) => `reportedAt_${f}`),
  ]
  const lines = [header.join(',')]
  for (const s of payload.stations) {
    const row = [
      s.permitNumber,
      s.name,
      s.address,
      s.stateExternalId,
      s.stateName,
      s.municipalityExternalId,
      s.municipalityName,
      s.latitude,
      s.longitude,
      s.source,
      s.firstSeenAt,
      s.lastSeenAt,
      ...fuelTypes.map((f) => s.prices[f]?.price ?? ''),
      ...fuelTypes.map((f) => s.prices[f]?.reportedAt ?? ''),
    ]
    lines.push(row.map(escapeCsv).join(','))
  }
  return lines.join('\n') + '\n'
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const sql = postgres(process.env.DATABASE_URL, { max: 1 })
  const stations = await sql`
    select l.permit_number as "permitNumber", l.name, l.address,
      l.state_external_id as "stateExternalId", l.state_name as "stateName",
      l.municipality_external_id as "municipalityExternalId",
      l.municipality_name as "municipalityName", l.latitude, l.longitude,
      s.source, s.first_seen_at as "firstSeenAt", s.last_seen_at as "lastSeenAt",
      l.prices
    from station_listings l join stations s on s.id = l.station_id
    order by l.permit_number
  `
  await sql.end()
  const payload = {
    stations: stations.map((row) => ({ ...row })),
    total: stations.length,
    withCoordinates: stations.filter((row) => row.latitude != null && row.longitude != null).length,
  }

  await mkdir(OUT_DIR, { recursive: true })

  const jsonPath = resolve(OUT_DIR, `stations-${DATE}.json`)
  await writeFile(jsonPath, JSON.stringify(payload, null, 2))
  console.log(`Wrote ${jsonPath} (${payload.total} stations, ${payload.withCoordinates} with coords)`)

  if (FORMAT === 'csv') {
    const csv = toCsv(payload)
    const csvPath = resolve(OUT_DIR, `stations-${DATE}.csv`)
    await writeFile(csvPath, csv)
    console.log(`Wrote ${csvPath} (${csv.length} bytes)`)
  } else if (FORMAT !== 'json') {
    console.error(`Unknown format "${FORMAT}". Use "json" or "csv".`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
