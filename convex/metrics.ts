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
// it well above $15 — so out-of-band values are excluded from the aggregation.
// The raw rows stay in fuelPricesCurrent; this only guards what feeds metrics.
const MIN_PLAUSIBLE_PRICE = 15
const MAX_PLAUSIBLE_PRICE = 50

type Extreme = {
  price: number
  name: string
  municipalityName?: string
  stateName?: string
  permitNumber: string
} | null

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
  mostExpensiveState: { name: string; avg: number } | null
  cheapestState: { name: string; avg: number } | null
  nationalAvgRegular: number | null
  generatedAt: string | null
}

// Per-state slice: reads only this state's prices and stations, which stays
// under the per-transaction op budget. A single live scan of `stations` +
// `fuelPricesCurrent` (~8k + ~37k rows) blows the budget — that is why the old
// live `getMetrics` timed out. We sum/aggregate per state and merge the slices
// in the rebuild action below.
type StateMetricsSlice = {
  stateExternalId: string
  name: string
  totalStations: number
  pricedStations: number
  perFuel: Record<
    string,
    { cheapest: Extreme; expensive: Extreme; sum: number; count: number }
  >
  regularSum: number
  regularCount: number
}

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

    const perFuel: StateMetricsSlice['perFuel'] = {}
    for (const f of FUELS) {
      perFuel[f] = { cheapest: null, expensive: null, sum: 0, count: 0 }
    }

    const pricedStations = new Set<string>()
    let regularSum = 0
    let regularCount = 0

    for (const p of prices) {
      if (!(p.fuelType in perFuel)) continue
      if (p.price < MIN_PLAUSIBLE_PRICE || p.price > MAX_PLAUSIBLE_PRICE) continue
      pricedStations.add(p.stationPermitNumber)
      const slot = perFuel[p.fuelType]
      const st = stationByPermit.get(p.stationPermitNumber)
      const rec: Extreme = {
        price: p.price,
        name: st?.name ?? p.stationPermitNumber,
        municipalityName: st?.municipalityName,
        stateName: st?.stateName ?? state.name,
        permitNumber: p.stationPermitNumber,
      }
      if (!slot.cheapest || p.price < slot.cheapest.price) slot.cheapest = rec
      if (!slot.expensive || p.price > slot.expensive.price) slot.expensive = rec
      slot.sum += p.price
      slot.count += 1

      if (p.fuelType === 'regular') {
        regularSum += p.price
        regularCount += 1
      }
    }

    return {
      stateExternalId: state.externalId,
      name: state.name,
      totalStations: stations.length,
      pricedStations: pricedStations.size,
      perFuel,
      regularSum,
      regularCount,
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

// Recompute the national metrics snapshot one state at a time, merge in action
// memory, and persist a single blob. Cron-driven after the daily price refresh.
export const rebuildMetricsCache = internalAction({
  args: {},
  handler: async (ctx) => {
    const stateIds = await ctx.runQuery(
      internal.metrics.listStateExternalIdsForMetrics,
      {},
    )

    const perFuel: Record<
      string,
      { cheapest: Extreme; expensive: Extreme; sum: number; count: number }
    > = {}
    for (const f of FUELS) {
      perFuel[f] = { cheapest: null, expensive: null, sum: 0, count: 0 }
    }

    const avgByState: MetricsData['avgByState'] = []
    let totalStations = 0
    let pricedStations = 0
    let nationalRegularSum = 0
    let nationalRegularCount = 0

    for (const stateExternalId of stateIds) {
      const slice = await ctx.runQuery(internal.metrics.metricsForState, {
        stateExternalId,
      })
      if (!slice) continue

      totalStations += slice.totalStations
      pricedStations += slice.pricedStations
      nationalRegularSum += slice.regularSum
      nationalRegularCount += slice.regularCount

      for (const f of FUELS) {
        const src = slice.perFuel[f]
        if (!src) continue
        const dst = perFuel[f]
        if (src.cheapest && (!dst.cheapest || src.cheapest.price < dst.cheapest.price)) {
          dst.cheapest = src.cheapest
        }
        if (
          src.expensive &&
          (!dst.expensive || src.expensive.price > dst.expensive.price)
        ) {
          dst.expensive = src.expensive
        }
        dst.sum += src.sum
        dst.count += src.count
      }

      if (slice.regularCount > 0) {
        avgByState.push({
          stateExternalId: slice.stateExternalId,
          name: slice.name,
          avg: slice.regularSum / slice.regularCount,
          count: slice.regularCount,
        })
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
    }

    avgByState.sort((a, b) => b.avg - a.avg)

    const payload: MetricsData = {
      totalStations,
      pricedStations,
      perFuel: perFuelOut,
      avgByState,
      mostExpensiveState: avgByState[0]
        ? { name: avgByState[0].name, avg: avgByState[0].avg }
        : null,
      cheapestState: avgByState.length
        ? {
            name: avgByState[avgByState.length - 1].name,
            avg: avgByState[avgByState.length - 1].avg,
          }
        : null,
      nationalAvgRegular: nationalRegularCount
        ? nationalRegularSum / nationalRegularCount
        : null,
      generatedAt: new Date().toISOString(),
    }

    await ctx.runMutation(internal.metrics.writeMetricsCache, {
      data: JSON.stringify(payload),
    })

    return { states: avgByState.length, pricedStations, totalStations }
  },
})

const EMPTY_METRICS: MetricsData = {
  totalStations: 0,
  pricedStations: 0,
  perFuel: Object.fromEntries(
    FUELS.map((f) => [f, { cheapest: null, expensive: null, avg: 0, count: 0 }]),
  ),
  avgByState: [],
  mostExpensiveState: null,
  cheapestState: null,
  nationalAvgRegular: null,
  generatedAt: null,
}

export const getMetrics = query({
  args: {},
  handler: async (ctx): Promise<MetricsData> => {
    const cached = await ctx.db
      .query('metricsCache')
      .withIndex('by_key', (q) => q.eq('key', METRICS_CACHE_KEY))
      .unique()
    if (!cached) return EMPTY_METRICS
    return JSON.parse(cached.data) as MetricsData
  },
})
