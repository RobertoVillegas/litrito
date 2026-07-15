import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import { latBucketFor } from './geocells'

export type ListingPrice = { price: number; reportedAt?: string }
export type ListingPrices = {
  regular?: ListingPrice
  premium?: ListingPrice
  diesel?: ListingPrice
  duba?: ListingPrice
  unknown?: ListingPrice
}

export type ListingEnrichment = {
  brand: string | null
  displayName: string | null
  source: string
}

type StationProjection = Pick<
  Doc<'stations'>,
  | '_id'
  | 'permitNumber'
  | 'name'
  | 'address'
  | 'stateExternalId'
  | 'municipalityExternalId'
  | 'stateName'
  | 'municipalityName'
  | 'latitude'
  | 'longitude'
  | 'latBucket'
  | 'firstSeenAt'
>

export function pricesFromDocs(
  docs: Array<Pick<Doc<'fuelPricesCurrent'>, 'fuelType' | 'price' | 'reportedAt'>>,
): ListingPrices {
  const prices: ListingPrices = {}
  for (const doc of docs) {
    prices[doc.fuelType] = {
      price: doc.price,
      ...(doc.reportedAt ? { reportedAt: doc.reportedAt } : {}),
    }
  }
  return prices
}

export function enrichmentFromDoc(
  row: Doc<'stationEnrichment'> | null | undefined,
): ListingEnrichment | null {
  if (!row) return null
  return {
    brand: row.brand ?? null,
    displayName: row.displayName ?? null,
    source: row.source,
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export async function upsertStationListing(
  ctx: MutationCtx,
  args: {
    station: StationProjection
    prices: ListingPrices
    enrichment?: ListingEnrichment | null
    existing?: Doc<'stationListings'> | null
  },
): Promise<{ changed: boolean }> {
  const existing =
    args.existing === undefined
      ? await ctx.db
          .query('stationListings')
          .withIndex('by_permit', (q) =>
            q.eq('permitNumber', args.station.permitNumber),
          )
          .unique()
      : args.existing
  const enrichment =
    args.enrichment === undefined ? existing?.enrichment : args.enrichment ?? undefined
  const value = {
    stationId: args.station._id,
    permitNumber: args.station.permitNumber,
    name: args.station.name,
    address: args.station.address,
    stateExternalId: args.station.stateExternalId,
    municipalityExternalId: args.station.municipalityExternalId,
    stateName: args.station.stateName,
    municipalityName: args.station.municipalityName,
    latitude: args.station.latitude,
    longitude: args.station.longitude,
    latBucket:
      args.station.latBucket ??
      (typeof args.station.latitude === 'number'
        ? latBucketFor(args.station.latitude)
        : undefined),
    firstSeenAt: args.station.firstSeenAt,
    regularPrice: args.prices.regular?.price,
    premiumPrice: args.prices.premium?.price,
    dieselPrice: args.prices.diesel?.price,
    dubaPrice: args.prices.duba?.price,
    unknownPrice: args.prices.unknown?.price,
    prices: args.prices,
    enrichment,
  }

  if (existing) {
    const comparable = {
      stationId: existing.stationId,
      permitNumber: existing.permitNumber,
      name: existing.name,
      address: existing.address,
      stateExternalId: existing.stateExternalId,
      municipalityExternalId: existing.municipalityExternalId,
      stateName: existing.stateName,
      municipalityName: existing.municipalityName,
      latitude: existing.latitude,
      longitude: existing.longitude,
      latBucket: existing.latBucket,
      firstSeenAt: existing.firstSeenAt,
      regularPrice: existing.regularPrice,
      premiumPrice: existing.premiumPrice,
      dieselPrice: existing.dieselPrice,
      dubaPrice: existing.dubaPrice,
      unknownPrice: existing.unknownPrice,
      prices: existing.prices,
      enrichment: existing.enrichment,
    }
    if (sameJson(comparable, value)) return { changed: false }
    await ctx.db.patch(existing._id, {
      ...value,
      updatedAt: new Date().toISOString(),
    })
  } else {
    await ctx.db.insert('stationListings', {
      ...value,
      updatedAt: new Date().toISOString(),
    })
  }
  return { changed: true }
}

// One-time and repair backfill for both the read model and coordinate status.
// Small self-chaining mutations keep each transaction comfortably bounded.
export const backfillStationListings = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    if (args.cursor === undefined) {
      const ready = await ctx.db
        .query('filterOptionsCache')
        .withIndex('by_key', (q) => q.eq('key', 'station-listings-ready'))
        .unique()
      if (ready) await ctx.db.delete(ready._id)
    }

    const page = await ctx.db
      .query('stations')
      .paginate({ cursor: args.cursor ?? null, numItems: 40 })
    let changed = 0
    for (const station of page.page) {
      const [priceDocs, enrichment] = await Promise.all([
        ctx.db
          .query('fuelPricesCurrent')
          .withIndex('by_station_fuel', (q) =>
            q.eq('stationPermitNumber', station.permitNumber),
          )
          .collect(),
        ctx.db
          .query('stationEnrichment')
          .withIndex('by_station', (q) =>
            q.eq('stationPermitNumber', station.permitNumber),
          )
          .unique(),
      ])
      if (!station.coordinateStatus) {
        await ctx.db.patch(station._id, {
          coordinateStatus:
            typeof station.latitude === 'number' &&
            typeof station.longitude === 'number'
              ? 'located'
              : 'pending',
        })
      }
      const result = await upsertStationListing(ctx, {
        station,
        prices: pricesFromDocs(priceDocs),
        enrichment: enrichmentFromDoc(enrichment),
      })
      if (result.changed) changed += 1
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.listings.backfillStationListings, {
        cursor: page.continueCursor,
      })
    } else {
      const readyAt = new Date().toISOString()
      await ctx.db.insert('filterOptionsCache', {
        key: 'station-listings-ready',
        data: JSON.stringify({ ready: true, readyAt }),
        updatedAt: readyAt,
      })
    }
    return { processed: page.page.length, changed, isDone: page.isDone }
  },
})

export const getBackfillStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const ready = await ctx.db
      .query('filterOptionsCache')
      .withIndex('by_key', (q) => q.eq('key', 'station-listings-ready'))
      .unique()
    const firstListing = await ctx.db.query('stationListings').first()
    return {
      ready: Boolean(ready),
      readyAt: ready?.updatedAt ?? null,
      hasListings: Boolean(firstListing),
    }
  },
})
