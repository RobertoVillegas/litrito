import type { ListingEnrichment, ListingPrices } from '#/db/schema'

export type FuelType = 'regular' | 'premium' | 'diesel' | 'duba' | 'unknown'
export type SortMode = 'price' | 'distance' | 'name'
export type UserLocation = { latitude: number; longitude: number }

export type PublicStation = {
  _id: string
  _creationTime: number
  placeId?: string
  permitNumber: string
  name: string
  address: string
  stateExternalId: string
  municipalityExternalId: string
  stateName?: string
  municipalityName?: string
  latitude?: number
  longitude?: number
  latBucket?: number
  coordinateStatus?: 'pending' | 'located' | 'failed'
  coordinateCheckedAt?: string
  source: 'CNE'
  firstSeenAt: string
  lastSeenAt: string
}

export type StationRow = {
  station: PublicStation
  prices: ListingPrices
  highlightedPrice: number | null
  distanceKm?: number | null
  enrichment: ListingEnrichment | null
}

export type FilterOptions = {
  states: { externalId: string; name: string; count: number }[]
  municipalities: {
    externalId: string
    stateExternalId: string
    name: string
    count: number
  }[]
}
