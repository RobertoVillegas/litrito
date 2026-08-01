import type {
  AreaBoundsInput,
  BoundsInput,
  ListStationsInput,
  NearbyStationsInput,
  SeoLocationInput,
} from '../dtos/public-data.dto'

// Application-owned port. Concrete return types remain on the adapter so the
// composition root can preserve precise inference without leaking Drizzle rows.
export interface PublicDataRepository {
  readFilterOptions(): Promise<unknown>
  readMetrics(): Promise<unknown>
  readLatestPriceRun(): Promise<unknown>
  readStationHistory(permitNumber: string): Promise<unknown>
  readStationDetail(permitNumber: string): Promise<unknown>
  readStationsByPermits(permitNumbers: string[]): Promise<unknown>
  readBestNearby(input: NearbyStationsInput): Promise<unknown>
  readStationList(input: ListStationsInput): Promise<unknown>
  readStationsInBounds(input: BoundsInput): Promise<unknown>
  readAreaBounds(input: AreaBoundsInput): Promise<unknown>
  readSeoLocationOverview(input: SeoLocationInput): Promise<unknown>
  readSitemapLocations(): Promise<unknown>
}
