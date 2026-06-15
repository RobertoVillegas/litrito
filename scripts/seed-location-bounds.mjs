import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api.js'
import { readFile } from 'node:fs/promises'

const SOURCE =
  'https://github.com/MacWilliXD/INEGI-geojson/tree/main/geojson_descargas'
const RAW_BASE =
  'https://raw.githubusercontent.com/MacWilliXD/INEGI-geojson/main/geojson_descargas'
const STATE_IDS = Array.from({ length: 32 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
)

function readEnvFile(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

async function convexUrl() {
  if (process.env.VITE_CONVEX_URL) return process.env.VITE_CONVEX_URL
  try {
    const env = readEnvFile(await readFile('.env.local', 'utf8'))
    if (env.VITE_CONVEX_URL) return env.VITE_CONVEX_URL
  } catch {
    // Fall through to the production self-hosted deployment.
  }
  return 'https://litrito-convex.litrito.com'
}

function expandBounds(bounds, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return bounds
  return {
    swLat: Math.min(bounds.swLat, lat),
    swLon: Math.min(bounds.swLon, lon),
    neLat: Math.max(bounds.neLat, lat),
    neLon: Math.max(bounds.neLon, lon),
  }
}

function walkCoordinates(value, bounds) {
  if (!Array.isArray(value)) return bounds
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    return expandBounds(bounds, value[0], value[1])
  }
  let next = bounds
  for (const item of value) next = walkCoordinates(item, next)
  return next
}

function emptyBounds() {
  return {
    swLat: Infinity,
    swLon: Infinity,
    neLat: -Infinity,
    neLon: -Infinity,
  }
}

function isValidBounds(bounds) {
  return (
    Number.isFinite(bounds.swLat) &&
    Number.isFinite(bounds.swLon) &&
    Number.isFinite(bounds.neLat) &&
    Number.isFinite(bounds.neLon)
  )
}

function featureBounds(feature) {
  const bounds = walkCoordinates(feature.geometry?.coordinates, emptyBounds())
  return isValidBounds(bounds) ? bounds : null
}

function stateBounds(rows, stateExternalId) {
  let bounds = emptyBounds()
  for (const row of rows) {
    if (row.stateExternalId !== stateExternalId) continue
    bounds = {
      swLat: Math.min(bounds.swLat, row.swLat),
      swLon: Math.min(bounds.swLon, row.swLon),
      neLat: Math.max(bounds.neLat, row.neLat),
      neLon: Math.max(bounds.neLon, row.neLon),
    }
  }
  return isValidBounds(bounds) ? bounds : null
}

function featureIds(feature, fallbackStateId) {
  const props = feature.properties ?? {}
  const cvegeo = String(
    props.CVEGEO ?? props.CVEGEO__ ?? props.CVEGEO_ ?? props.cvegeo ?? '',
  )
  const rawStateCandidate =
    props.CVE_ENT ??
    props.CVE_ENT_ ??
    props.cve_agee ??
    props.cve_ent ??
    props.ENTIDAD ??
    cvegeo.slice(0, 2)
  const rawMunicipalityCandidate =
    props.CVE_MUN ??
    props.CVE_MUN_ ??
    props.cve_agem ??
    props.cve_mun ??
    props.MUNICIPIO ??
    cvegeo.slice(2, 5)
  const rawStateId = rawStateCandidate || fallbackStateId
  const rawMunicipalityId = rawMunicipalityCandidate || ''
  const stateExternalId = String(rawStateId).padStart(2, '0')
  const municipalityExternalId = String(rawMunicipalityId).padStart(3, '0')
  return { stateExternalId, municipalityExternalId }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'litrito-location-bounds-seed/1.0',
    },
  })
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`)
  }
  return await response.json()
}

async function main() {
  const client = new ConvexHttpClient(await convexUrl())
  const rows = []

  for (const stateExternalId of STATE_IDS) {
    const url = `${RAW_BASE}/AGEM_${stateExternalId}.geojson`
    const geojson = await fetchJson(url)
    let stateFeatureCount = 0
    for (const feature of geojson.features ?? []) {
      const bounds = featureBounds(feature)
      if (!bounds) continue
      const ids = featureIds(feature, stateExternalId)
      if (!ids.municipalityExternalId || ids.stateExternalId !== stateExternalId) {
        continue
      }
      rows.push({
        stateExternalId: ids.stateExternalId,
        municipalityExternalId: ids.municipalityExternalId,
        ...bounds,
        source: SOURCE,
      })
      stateFeatureCount += 1
    }

    const bounds = stateBounds(rows, stateExternalId)
    if (bounds) {
      rows.push({
        stateExternalId,
        ...bounds,
        source: SOURCE,
      })
    }
    console.log(`prepared ${stateExternalId}: ${stateFeatureCount} municipalities`)
  }

  let written = 0
  const chunkSize = 100
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const result = await client.mutation(api.locationBounds.upsertMany, {
      bounds: chunk,
    })
    written += result.written
    console.log(`wrote ${written}/${rows.length}`)
  }

  console.log(`done: ${written} bounds`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
