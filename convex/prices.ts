import { v } from 'convex/values'
import { query } from './_generated/server'
import { fuelTypeValidator } from './validators'

const fuelType = fuelTypeValidator

export const latestRun = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query('ingestionRuns')
      .withIndex('by_kind_started', (q) => q.eq('kind', 'municipality_prices'))
      .order('desc')
      .take(1)

    return runs[0] ?? null
  },
})

export const search = query({
  args: {
    stateExternalId: v.optional(v.string()),
    municipalityExternalId: v.optional(v.string()),
    fuelType: v.optional(fuelType),
    q: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 80, 200)
    const stateExternalId = args.stateExternalId
    const municipalityExternalId = args.municipalityExternalId
    const selectedFuel = args.fuelType ?? 'regular'
    const searchTerm = args.q?.trim()

    let stations =
      stateExternalId && municipalityExternalId
        ? await ctx.db
            .query('stations')
            .withIndex('by_location', (q) =>
              q
                .eq('stateExternalId', stateExternalId)
                .eq('municipalityExternalId', municipalityExternalId),
            )
            .take(500)
        : await ctx.db.query('stations').take(500)

    if (searchTerm) {
      const normalizedTerm = searchTerm.toLowerCase()
      stations = stations.filter((station) => {
        return (
          station.name.toLowerCase().includes(normalizedTerm) ||
          station.address.toLowerCase().includes(normalizedTerm) ||
          station.permitNumber.toLowerCase().includes(normalizedTerm)
        )
      })
    }

    const rows = []

    for (const station of stations) {
      const currentPrices = await ctx.db
        .query('fuelPricesCurrent')
        .withIndex('by_station_fuel', (q) =>
          q.eq('stationPermitNumber', station.permitNumber),
        )
        .collect()

      const prices = Object.fromEntries(
        currentPrices.map((price) => [price.fuelType, price]),
      )
      const highlightedPrice = prices[selectedFuel]

      if (selectedFuel !== 'unknown' && !highlightedPrice) {
        continue
      }

      rows.push({
        station,
        prices,
        highlightedPrice: highlightedPrice?.price ?? null,
      })
    }

    return rows
      .sort((a, b) => {
        const aPrice = a.highlightedPrice ?? Number.POSITIVE_INFINITY
        const bPrice = b.highlightedPrice ?? Number.POSITIVE_INFINITY
        return aPrice - bPrice || a.station.name.localeCompare(b.station.name)
      })
      .slice(0, limit)
  },
})

export const stationHistory = query({
  args: { permitNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('fuelPricesHistory')
      .withIndex('by_station', (q) =>
        q.eq('stationPermitNumber', args.permitNumber),
      )
      .order('desc')
      .take(120)
  },
})
