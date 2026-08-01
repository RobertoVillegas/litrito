import { getDatabase } from '#/db/client'
import { slugifyLocationName } from '#/lib/slug'

const FUELS = ['regular', 'premium', 'diesel', 'duba'] as const
type Extreme = { price: number; name: string; municipalityName: string | null; stateName: string | null; permitNumber: string }
type Acc = {
  stations: Set<string>
  fuels: Record<string, { cheapest: Extreme | null; expensive: Extreme | null; sum: number; count: number }>
}
const accumulator = (): Acc => ({
  stations: new Set(),
  fuels: Object.fromEntries(FUELS.map((fuel) => [fuel, { cheapest: null, expensive: null, sum: 0, count: 0 }])),
})

function feed(acc: Acc, row: PriceRow) {
  const fuel = acc.fuels[row.fuel_type]
  if (!fuel) return
  const extreme = {
    price: row.price, name: row.name, municipalityName: row.municipality_name,
    stateName: row.state_name, permitNumber: row.station_permit_number,
  }
  acc.stations.add(row.station_permit_number)
  if (!fuel.cheapest || row.price < fuel.cheapest.price) fuel.cheapest = extreme
  if (!fuel.expensive || row.price > fuel.expensive.price) fuel.expensive = extreme
  fuel.sum += row.price
  fuel.count += 1
}

type PriceRow = {
  fuel_type: string
  price: number
  station_permit_number: string
  name: string
  municipality_name: string | null
  state_name: string | null
  state_external_id: string
}

function national(states: Map<string, { name: string; total: number; acc: Acc }>) {
  const combined = accumulator()
  const avgByStateByFuel: Record<string, Array<{ stateExternalId: string; name: string; avg: number; count: number }>> =
    Object.fromEntries(FUELS.map((fuel) => [fuel, []]))
  let totalStations = 0
  let pricedStations = 0
  for (const [stateExternalId, state] of states) {
    totalStations += state.total
    pricedStations += state.acc.stations.size
    for (const fuel of FUELS) {
      const source = state.acc.fuels[fuel]
      const target = combined.fuels[fuel]
      if (source.cheapest && (!target.cheapest || source.cheapest.price < target.cheapest.price)) target.cheapest = source.cheapest
      if (source.expensive && (!target.expensive || source.expensive.price > target.expensive.price)) target.expensive = source.expensive
      target.sum += source.sum
      target.count += source.count
      if (source.count) avgByStateByFuel[fuel].push({ stateExternalId, name: state.name, avg: source.sum / source.count, count: source.count })
    }
  }
  const perFuel: Record<string, {
    cheapest: Extreme | null
    expensive: Extreme | null
    avg: number
    count: number
  }> = {}
  const nationalAvgByFuel: Record<string, number | null> = {}
  const mostExpensiveStateByFuel: Record<string, { name: string; avg: number } | null> = {}
  const cheapestStateByFuel: Record<string, { name: string; avg: number } | null> = {}
  for (const fuel of FUELS) {
    const value = combined.fuels[fuel]
    const rows = avgByStateByFuel[fuel].sort((a, b) => b.avg - a.avg)
    perFuel[fuel] = { cheapest: value.cheapest, expensive: value.expensive, avg: value.count ? value.sum / value.count : 0, count: value.count }
    nationalAvgByFuel[fuel] = value.count ? value.sum / value.count : null
    mostExpensiveStateByFuel[fuel] = rows[0] ? { name: rows[0].name, avg: rows[0].avg } : null
    const last = rows.at(-1)
    cheapestStateByFuel[fuel] = last ? { name: last.name, avg: last.avg } : null
  }
  return {
    totalStations, pricedStations, perFuel,
    avgByState: avgByStateByFuel.regular,
    avgByStateByFuel,
    mostExpensiveState: mostExpensiveStateByFuel.regular,
    cheapestState: cheapestStateByFuel.regular,
    mostExpensiveStateByFuel, cheapestStateByFuel,
    nationalAvgRegular: nationalAvgByFuel.regular,
    nationalAvgByFuel,
  }
}

export async function rebuildReadCaches() {
  const { sql } = getDatabase()
  const states = await sql<{ external_id: string; name: string; count: number }[]>`
    select s.external_id, s.name, count(st.id)::int as count
    from states s left join stations st on st.state_external_id = s.external_id
    group by s.external_id, s.name order by s.name
  `
  const municipalities = await sql<{ external_id: string; state_external_id: string; name: string; count: number }[]>`
    select m.external_id, m.state_external_id, m.name, count(st.id)::int as count
    from municipalities m left join stations st on st.state_external_id = m.state_external_id
      and st.municipality_external_id = m.external_id
    group by m.external_id, m.state_external_id, m.name having count(st.id) > 0
    order by m.name
  `
  const filters = {
    states: states.map((row) => ({ externalId: row.external_id, name: row.name, count: row.count })),
    municipalities: municipalities.map((row) => ({ externalId: row.external_id, stateExternalId: row.state_external_id, name: row.name, count: row.count })),
  }
  const sitemap = {
    states: filters.states.map((row) => ({ externalId: row.externalId, slug: slugifyLocationName(row.name) })),
    municipalities: filters.municipalities.map((row) => ({ externalId: row.externalId, stateExternalId: row.stateExternalId, slug: slugifyLocationName(row.name) })),
  }

  const prices = await sql<PriceRow[]>`
    select p.fuel_type, p.price, p.station_permit_number, st.name,
      st.municipality_name, st.state_name, st.state_external_id
    from fuel_prices_current p join stations st on st.permit_number = p.station_permit_number
    where p.fuel_type in ('regular', 'premium', 'diesel', 'duba')
  `
  const stateMeta = new Map(states.map((state) => [state.external_id, { name: state.name, total: state.count }]))
  const raw = new Map([...stateMeta].map(([id, meta]) => [id, { ...meta, acc: accumulator() }]))
  const curated = new Map([...stateMeta].map(([id, meta]) => [id, { ...meta, acc: accumulator() }]))
  let excludedPriceRows = 0
  for (const row of prices) {
    const rawState = raw.get(row.state_external_id)
    if (rawState) feed(rawState.acc, row)
    if (row.price >= 15 && row.price <= 50) {
      const curatedState = curated.get(row.state_external_id)
      if (curatedState) feed(curatedState.acc, row)
    } else excludedPriceRows += 1
  }
  const metrics = {
    curated: national(curated), raw: national(raw),
    priceBand: { min: 15, max: 50 }, excludedPriceRows,
    generatedAt: new Date().toISOString(),
  }
  await sql.begin(async (tx) => {
    for (const [key, data] of [['default', filters], ['sitemap-locations', sitemap]] as const) {
      await tx`
        insert into filter_options_cache (id, key, data, updated_at)
        values (${crypto.randomUUID()}, ${key}, ${JSON.stringify(data)}::jsonb, now())
        on conflict (key) do update set data = excluded.data, updated_at = now()
      `
    }
    await tx`
      insert into metrics_cache (id, key, data, updated_at)
      values (${crypto.randomUUID()}, 'default', ${JSON.stringify(metrics)}::jsonb, now())
      on conflict (key) do update set data = excluded.data, updated_at = now()
    `
  })
}
