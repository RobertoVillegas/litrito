import { v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server'
import { internal } from './_generated/api'

const FUELS = ['regular', 'premium', 'diesel', 'duba'] as const

const METRICS_CACHE_KEY = 'default'

// CNE's feed occasionally reports junk prices (e.g. $3.34 or $14.53 per liter).
// No real Mexican fuel price falls outside this band — IEPS + taxes alone keep
// it well above $15 — so out-of-band values are excluded from the "curated"
// view. The "raw" view keeps everything; the UI toggles between them. Raw rows
// always stay in fuelPricesCurrent; this only shapes what feeds the charts.
const MIN_PLAUSIBLE_PRICE = 15
const MAX_PLAUSIBLE_PRICE = 50

type Extreme = {
  price: number
  name: string
  municipalityName?: string
  stateName?: string
  permitNumber: string
} | null

type FuelAgg = { cheapest: Extreme; expensive: Extreme; sum: number; count: number }

type PerFuel = {
  cheapest: Extreme
  expensive: Extreme
  avg: number
  count: number
}

type MetricsData = {
  totalStations: number
  pricedStations: number
  perFuel: Record<string, PerFuel>
  avgByState: {
    stateExternalId: string
    name: string
    avg: number
    count: number
  }[]
  avgByStateByFuel: Record<
    string,
    {
      stateExternalId: string
      name: string
      avg: number
      count: number
    }[]
  >
  mostExpensiveState: { name: string; avg: number } | null
  cheapestState: { name: string; avg: number } | null
  mostExpensiveStateByFuel: Record<string, { name: string; avg: number } | null>
  cheapestStateByFuel: Record<string, { name: string; avg: number } | null>
  nationalAvgRegular: number | null
  nationalAvgByFuel: Record<string, number | null>
}

type MetricsBundle = {
  curated: MetricsData
  raw: MetricsData
  priceBand: { min: number; max: number }
  excludedPriceRows: number
  generatedAt: string | null
}

// Serializable per-state, per-view aggregate.
type StateAgg = {
  perFuel: Record<string, FuelAgg>
  pricedStations: number
}

type StateMetricsSlice = {
  stateExternalId: string
  name: string
  totalStations: number
  raw: StateAgg
  curated: StateAgg
  excluded: number
}

// Mutable accumulator used while scanning a state's prices.
type Acc = {
  perFuel: Record<string, FuelAgg>
  stations: Set<string>
}

function newAcc(): Acc {
  const perFuel: Record<string, FuelAgg> = {}
  for (const f of FUELS) {
    perFuel[f] = { cheapest: null, expensive: null, sum: 0, count: 0 }
  }
  return { perFuel, stations: new Set() }
}

function feed(acc: Acc, fuelType: string, price: number, rec: Extreme, permit: string) {
  const slot = acc.perFuel[fuelType]
  if (!slot) return
  acc.stations.add(permit)
  if (!slot.cheapest || price < slot.cheapest.price) slot.cheapest = rec
  if (!slot.expensive || price > slot.expensive.price) slot.expensive = rec
  slot.sum += price
  slot.count += 1
}

function finalizeAcc(acc: Acc): StateAgg {
  return {
    perFuel: acc.perFuel,
    pricedStations: acc.stations.size,
  }
}

// Per-state slice: reads only this state's prices and stations, so a single
// transaction stays under the op budget. A live scan of `stations` +
// `fuelPricesCurrent` (~8k + ~37k rows) blows it — that is why the old
// getMetrics timed out. Builds raw and curated aggregates in one pass.
export const metricsForState = internalQuery({
  args: { stateExternalId: v.string() },
  handler: async (ctx, args): Promise<StateMetricsSlice | null> => {
    const state = await ctx.db
      .query('states')
      .withIndex('by_external_id', (q) => q.eq('externalId', args.stateExternalId))
      .unique()
    if (!state) return null

    const stations = await ctx.db
      .query('stations')
      .withIndex('by_state', (q) => q.eq('stateExternalId', args.stateExternalId))
      .collect()
    const stationByPermit = new Map(stations.map((s) => [s.permitNumber, s]))

    const prices = await ctx.db
      .query('fuelPricesCurrent')
      .withIndex('by_state_fuel_price', (q) =>
        q.eq('stateExternalId', args.stateExternalId),
      )
      .collect()

    const raw = newAcc()
    const curated = newAcc()
    let excluded = 0

    for (const p of prices) {
      if (!(p.fuelType in raw.perFuel)) continue
      const st = stationByPermit.get(p.stationPermitNumber)
      const rec: Extreme = {
        price: p.price,
        name: st?.name ?? p.stationPermitNumber,
        municipalityName: st?.municipalityName,
        stateName: st?.stateName ?? state.name,
        permitNumber: p.stationPermitNumber,
      }
      feed(raw, p.fuelType, p.price, rec, p.stationPermitNumber)
      if (p.price >= MIN_PLAUSIBLE_PRICE && p.price <= MAX_PLAUSIBLE_PRICE) {
        feed(curated, p.fuelType, p.price, rec, p.stationPermitNumber)
      } else {
        excluded += 1
      }
    }

    return {
      stateExternalId: state.externalId,
      name: state.name,
      totalStations: stations.length,
      raw: finalizeAcc(raw),
      curated: finalizeAcc(curated),
      excluded,
    }
  },
})

export const listStateExternalIdsForMetrics = internalQuery({
  args: {},
  handler: async (ctx) => {
    const states = await ctx.db.query('states').collect()
    return states.map((s) => s.externalId)
  },
})

export const writeMetricsCache = internalMutation({
  args: { data: v.string() },
  handler: async (ctx, args) => {
    const value = {
      key: METRICS_CACHE_KEY,
      data: args.data,
      updatedAt: new Date().toISOString(),
    }
    const existing = await ctx.db
      .query('metricsCache')
      .withIndex('by_key', (q) => q.eq('key', METRICS_CACHE_KEY))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, value)
    } else {
      await ctx.db.insert('metricsCache', value)
    }
  },
})

// Merge per-state aggregates of one view (raw or curated) into national totals.
function buildNational(
  items: { stateExternalId: string; name: string; totalStations: number; agg: StateAgg }[],
): MetricsData {
  const perFuel: Record<string, FuelAgg> = {}
  for (const f of FUELS) {
    perFuel[f] = { cheapest: null, expensive: null, sum: 0, count: 0 }
  }

  const avgByStateByFuel: MetricsData['avgByStateByFuel'] = {}
  const nationalAvgByFuel: MetricsData['nationalAvgByFuel'] = {}
  for (const f of FUELS) {
    avgByStateByFuel[f] = []
    nationalAvgByFuel[f] = null
  }
  let totalStations = 0
  let pricedStations = 0

  for (const { stateExternalId, name, totalStations: stationCount, agg } of items) {
    totalStations += stationCount
    pricedStations += agg.pricedStations

    for (const f of FUELS) {
      const src = agg.perFuel[f]
      if (!src) continue
      const dst = perFuel[f]
      if (src.cheapest && (!dst.cheapest || src.cheapest.price < dst.cheapest.price)) {
        dst.cheapest = src.cheapest
      }
      if (src.expensive && (!dst.expensive || src.expensive.price > dst.expensive.price)) {
        dst.expensive = src.expensive
      }
      dst.sum += src.sum
      dst.count += src.count
      if (src.count > 0) {
        avgByStateByFuel[f].push({
          stateExternalId,
          name,
          avg: src.sum / src.count,
          count: src.count,
        })
      }
    }
  }

  const perFuelOut: Record<string, PerFuel> = {}
  for (const f of FUELS) {
    const agg = perFuel[f]
    perFuelOut[f] = {
      cheapest: agg.cheapest,
      expensive: agg.expensive,
      avg: agg.count ? agg.sum / agg.count : 0,
      count: agg.count,
    }
    nationalAvgByFuel[f] = agg.count ? agg.sum / agg.count : null
  }

  for (const f of FUELS) {
    avgByStateByFuel[f].sort((a, b) => b.avg - a.avg)
  }

  const avgByState = avgByStateByFuel.regular ?? []
  const mostExpensiveStateByFuel: MetricsData['mostExpensiveStateByFuel'] = {}
  const cheapestStateByFuel: MetricsData['cheapestStateByFuel'] = {}
  for (const f of FUELS) {
    const rows = avgByStateByFuel[f] ?? []
    mostExpensiveStateByFuel[f] = rows[0]
      ? { name: rows[0].name, avg: rows[0].avg }
      : null
    cheapestStateByFuel[f] = rows.length
      ? { name: rows[rows.length - 1].name, avg: rows[rows.length - 1].avg }
      : null
  }

  return {
    totalStations,
    pricedStations,
    perFuel: perFuelOut,
    avgByState,
    avgByStateByFuel,
    mostExpensiveState: mostExpensiveStateByFuel.regular,
    cheapestState: cheapestStateByFuel.regular,
    mostExpensiveStateByFuel,
    cheapestStateByFuel,
    nationalAvgRegular: nationalAvgByFuel.regular,
    nationalAvgByFuel,
  }
}

// Recompute the national metrics snapshot one state at a time, merge in action
// memory, and persist a single blob (both raw and curated views). Cron-driven
// after the daily price refresh.
export const rebuildMetricsCache = internalAction({
  args: {},
  handler: async (ctx) => {
    const stateIds = await ctx.runQuery(
      internal.metrics.listStateExternalIdsForMetrics,
      {},
    )

    const slices: StateMetricsSlice[] = []
    for (const stateExternalId of stateIds) {
      const slice = await ctx.runQuery(internal.metrics.metricsForState, {
        stateExternalId,
      })
      if (slice) slices.push(slice)
    }

    const meta = slices.map((s) => ({
      stateExternalId: s.stateExternalId,
      name: s.name,
      totalStations: s.totalStations,
    }))

    const payload: MetricsBundle = {
      curated: buildNational(slices.map((s, i) => ({ ...meta[i], agg: s.curated }))),
      raw: buildNational(slices.map((s, i) => ({ ...meta[i], agg: s.raw }))),
      priceBand: { min: MIN_PLAUSIBLE_PRICE, max: MAX_PLAUSIBLE_PRICE },
      excludedPriceRows: slices.reduce((sum, s) => sum + s.excluded, 0),
      generatedAt: new Date().toISOString(),
    }

    await ctx.runMutation(internal.metrics.writeMetricsCache, {
      data: JSON.stringify(payload),
    })

    return {
      states: payload.curated.avgByState.length,
      pricedStations: payload.curated.pricedStations,
      excludedPriceRows: payload.excludedPriceRows,
    }
  },
})

const EMPTY_VIEW: MetricsData = {
  totalStations: 0,
  pricedStations: 0,
  perFuel: Object.fromEntries(
    FUELS.map((f) => [f, { cheapest: null, expensive: null, avg: 0, count: 0 }]),
  ),
  avgByState: [],
  avgByStateByFuel: Object.fromEntries(FUELS.map((f) => [f, []])),
  mostExpensiveState: null,
  cheapestState: null,
  mostExpensiveStateByFuel: Object.fromEntries(FUELS.map((f) => [f, null])),
  cheapestStateByFuel: Object.fromEntries(FUELS.map((f) => [f, null])),
  nationalAvgRegular: null,
  nationalAvgByFuel: Object.fromEntries(FUELS.map((f) => [f, null])),
}

const EMPTY_BUNDLE: MetricsBundle = {
  curated: EMPTY_VIEW,
  raw: EMPTY_VIEW,
  priceBand: { min: MIN_PLAUSIBLE_PRICE, max: MAX_PLAUSIBLE_PRICE },
  excludedPriceRows: 0,
  generatedAt: null,
}

export const getMetrics = query({
  args: {},
  handler: async (ctx): Promise<MetricsBundle> => {
    const cached = await ctx.db
      .query('metricsCache')
      .withIndex('by_key', (q) => q.eq('key', METRICS_CACHE_KEY))
      .unique()
    if (!cached) return EMPTY_BUNDLE
    return JSON.parse(cached.data) as MetricsBundle
  },
})
