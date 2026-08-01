import postgres from 'postgres'

const SOURCE =
  'https://github.com/MacWilliXD/INEGI-geojson/tree/main/geojson_descargas'
const RAW_BASE =
  'https://raw.githubusercontent.com/MacWilliXD/INEGI-geojson/main/geojson_descargas'
const STATE_IDS = Array.from({ length: 32 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
)

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
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const sql = postgres(process.env.DATABASE_URL, { max: 1 })
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

  try {
    let written = 0
    for (const row of rows) {
      const key = row.municipalityExternalId
        ? `${row.stateExternalId}:${row.municipalityExternalId}`
        : row.stateExternalId
      await sql`
        insert into location_bounds (id, key, state_external_id,
          municipality_external_id, sw_lat, sw_lon, ne_lat, ne_lon, source, updated_at)
        values (${crypto.randomUUID()}, ${key}, ${row.stateExternalId},
          ${row.municipalityExternalId ?? null}, ${row.swLat}, ${row.swLon},
          ${row.neLat}, ${row.neLon}, ${row.source}, now())
        on conflict (key) do update set sw_lat=excluded.sw_lat, sw_lon=excluded.sw_lon,
          ne_lat=excluded.ne_lat, ne_lon=excluded.ne_lon, source=excluded.source,
          updated_at=now()
      `
      written += 1
      if (written % 100 === 0) console.log(`wrote ${written}/${rows.length}`)
    }
    console.log(`done: ${written} bounds`)
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
