import type { FuelType, SortMode, UserLocation } from '../../domain/models'

export type ListStationsInput = {
  fuelTypes?: FuelType[]
  search?: string
  stateExternalIds?: string[]
  municipalityExternalIds?: string[]
  sortMode: SortMode
  userLocation?: UserLocation
  paginationOpts: { cursor: string | null; numItems: number }
}

export type BoundsInput = {
  fuelTypes?: FuelType[]
  stateExternalIds?: string[]
  municipalityExternalIds?: string[]
  swLat: number
  swLon: number
  neLat: number
  neLon: number
  limit?: number
}

export type NearbyStationsInput = {
  fuelType: FuelType
  userLocation: UserLocation
  limit?: number
  maxDistanceKm?: number
}

export type AreaBoundsInput = {
  stateExternalId?: string
  municipalityExternalId?: string
}

export type SeoLocationInput = {
  stateSlug: string
  municipalitySlug?: string
}
