import postgres from 'postgres'

type Candidate = {
  permit_number: string
  name: string
  latitude: number
  longitude: number
  price: number
}

type Location = { name: string; latitude: number; longitude: number; radiusKm: number }

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const iterations = Math.max(Number(process.env.BENCH_ITERATIONS ?? 20), 3)
const sql = postgres(databaseUrl, { max: 1, connection: { application_name: 'litrito-geo-bench' } })
const locations: Location[] = [
  { name: 'CDMX', latitude: 19.4326, longitude: -99.1332, radiusKm: 15 },
  { name: 'Guadalajara', latitude: 20.6736, longitude: -103.344, radiusKm: 25 },
  { name: 'Monterrey', latitude: 25.6866, longitude: -100.3161, radiusKm: 50 },
  { name: 'Centro de México', latitude: 23.6345, longitude: -102.5528, radiusKm: 100 },
]

const toRad = (degrees: number) => (degrees * Math.PI) / 180
function haversineKm(origin: Location, row: Candidate) {
  const dLat = toRad(row.latitude - origin.latitude)
  const dLon = toRad(row.longitude - origin.longitude)
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(origin.latitude)) *
      Math.cos(toRad(row.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(value))
}

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(Math.floor(sorted.length * ratio), sorted.length - 1)] ?? 0
}

async function measure(run: () => Promise<unknown>) {
  await run()
  const samples: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now()
    await run()
    samples.push(performance.now() - startedAt)
  }
  return {
    medianMs: Number(percentile(samples, 0.5).toFixed(2)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(2)),
  }
}

async function legacyNearby(location: Location) {
  const latDelta = location.radiusKm / 111.32
  const lonDelta =
    location.radiusKm /
    (111.32 * Math.max(Math.abs(Math.cos(toRad(location.latitude))), 0.01))
  const rows = await sql<Candidate[]>`
    select permit_number, name, latitude, longitude, regular_price as price
    from station_listings
    where latitude between ${location.latitude - latDelta} and ${location.latitude + latDelta}
      and longitude between ${location.longitude - lonDelta} and ${location.longitude + lonDelta}
      and regular_price between 15 and 50
  `
  return rows
    .map((row) => ({ ...row, distance_km: haversineKm(location, row) }))
    .filter((row) => row.distance_km <= location.radiusKm)
    .sort(
      (a, b) =>
        a.price - b.price ||
        a.distance_km - b.distance_km ||
        a.permit_number.localeCompare(b.permit_number),
    )
    .slice(0, 10)
}

async function postgisNearby(location: Location) {
  return sql<{ permit_number: string; price: number; distance_km: number }[]>`
    select permit_number, regular_price as price,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${location.longitude}, ${location.latitude}), 4326)::geography
      ) / 1000.0 as distance_km
    from station_listings
    where latitude is not null and longitude is not null
      and regular_price between 15 and 50
      and ST_DWithin(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${location.longitude}, ${location.latitude}), 4326)::geography,
        ${location.radiusKm * 1_000}
      )
    order by regular_price, distance_km, permit_number
    limit 10
  `
}

try {
  const report = []
  for (const location of locations) {
    const [legacyRows, postgisRows] = await Promise.all([
      legacyNearby(location),
      postgisNearby(location),
    ])
    const legacyPermits = legacyRows.map((row) => row.permit_number)
    const postgisPermits = postgisRows.map((row) => row.permit_number)
    const sameResults = legacyPermits.join('|') === postgisPermits.join('|')
    if (!sameResults) {
      throw new Error(
        `${location.name}: PostGIS and the unbounded Haversine baseline returned different top permits`,
      )
    }
    const [legacy, postgis] = await Promise.all([
      measure(() => legacyNearby(location)),
      measure(() => postgisNearby(location)),
    ])
    report.push({
      location: location.name,
      radiusKm: location.radiusKm,
      sameResults,
      legacyMedianMs: legacy.medianMs,
      legacyP95Ms: legacy.p95Ms,
      postgisMedianMs: postgis.medianMs,
      postgisP95Ms: postgis.p95Ms,
      medianSpeedup: Number((legacy.medianMs / postgis.medianMs).toFixed(2)),
    })
  }
  console.table(report)
} finally {
  await sql.end({ timeout: 5 })
}
