import { query } from './_generated/server'

const FUELS = ['regular', 'premium', 'diesel', 'duba'] as const

type Extreme = {
  price: number
  name: string
  municipalityName?: string
  stateName?: string
  permitNumber: string
} | null

// NOTE: computes live by scanning fuelPricesCurrent. Fine at current scale; if
// the national dataset grows large this should move to a cached/precomputed
// snapshot (see filterOptionsCache for the pattern).
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    const [states, stations, prices] = await Promise.all([
      ctx.db.query('states').collect(),
      ctx.db.query('stations').collect(),
      ctx.db.query('fuelPricesCurrent').collect(),
    ])

    const stationByPermit = new Map(stations.map((s) => [s.permitNumber, s]))
    const stateName = new Map(states.map((s) => [s.externalId, s.name]))

    const perFuel: Record<
      string,
      { cheapest: Extreme; expensive: Extreme; avg: number; count: number }
    > = {}
    for (const f of FUELS) perFuel[f] = { cheapest: null, expensive: null, avg: 0, count: 0 }

    const stateAgg = new Map<string, { sum: number; count: number }>()
    let sumAll = 0
    let countAll = 0

    for (const p of prices) {
      const fuel = p.fuelType
      if (!(fuel in perFuel)) continue
      const slot = perFuel[fuel]
      const st = stationByPermit.get(p.stationPermitNumber)
      const rec = {
        price: p.price,
        name: st?.name ?? p.stationPermitNumber,
        municipalityName: st?.municipalityName,
        stateName: st?.stateName ?? stateName.get(p.stateExternalId),
        permitNumber: p.stationPermitNumber,
      }
      if (!slot.cheapest || p.price < slot.cheapest.price) slot.cheapest = rec
      if (!slot.expensive || p.price > slot.expensive.price) slot.expensive = rec
      slot.avg += p.price
      slot.count += 1

      if (fuel === 'regular') {
        const agg = stateAgg.get(p.stateExternalId) ?? { sum: 0, count: 0 }
        agg.sum += p.price
        agg.count += 1
        stateAgg.set(p.stateExternalId, agg)
        sumAll += p.price
        countAll += 1
      }
    }
    for (const f of FUELS) {
      if (perFuel[f].count) perFuel[f].avg = perFuel[f].avg / perFuel[f].count
    }

    const avgByState = [...stateAgg.entries()]
      .map(([id, a]) => ({
        stateExternalId: id,
        name: stateName.get(id) ?? id,
        avg: a.sum / a.count,
        count: a.count,
      }))
      .sort((a, b) => b.avg - a.avg)

    return {
      totalStations: stations.length,
      pricedStations: new Set(prices.map((p) => p.stationPermitNumber)).size,
      perFuel,
      avgByState,
      mostExpensiveState: avgByState[0] ?? null,
      cheapestState: avgByState[avgByState.length - 1] ?? null,
      nationalAvgRegular: countAll ? sumAll / countAll : null,
      generatedAt: new Date().toISOString(),
    }
  },
})
