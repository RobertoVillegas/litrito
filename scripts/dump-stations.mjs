#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SITE_URL =
  process.env.CONVEX_SITE_URL ??
  process.env.VITE_CONVEX_SITE_URL ??
  'https://cheerful-terrier-356.convex.site'

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
  const url = `${SITE_URL.replace(/\/$/, '')}/stations/export`
  console.log(`Fetching ${url} ...`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`)
  }
  const payload = await res.json()

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
