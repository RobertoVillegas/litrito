import type { PublicDataRepository } from '../ports/public-data.repository'

type PublicDataQueries<TRepository extends PublicDataRepository> = {
  getFilterOptions: TRepository['readFilterOptions']
  getMetrics: TRepository['readMetrics']
  getLatestPriceRun: TRepository['readLatestPriceRun']
  getStationHistory: TRepository['readStationHistory']
  getStationDetail: TRepository['readStationDetail']
  getStationsByPermits: TRepository['readStationsByPermits']
  getBestNearbyStations: TRepository['readBestNearby']
  getStationList: TRepository['readStationList']
  getStationsInBounds: TRepository['readStationsInBounds']
  getAreaBounds: TRepository['readAreaBounds']
  getSeoLocationOverview: TRepository['readSeoLocationOverview']
  getSitemapLocations: TRepository['readSitemapLocations']
}

// Each property is an explicit query use case. The generic keeps the adapter's
// DTO return types while the dependency itself is constrained by the app port.
export function createPublicDataQueries<TRepository extends PublicDataRepository>(
  repository: TRepository,
): PublicDataQueries<TRepository> {
  return {
    getFilterOptions: repository.readFilterOptions,
    getMetrics: repository.readMetrics,
    getLatestPriceRun: repository.readLatestPriceRun,
    getStationHistory: repository.readStationHistory,
    getStationDetail: repository.readStationDetail,
    getStationsByPermits: repository.readStationsByPermits,
    getBestNearbyStations: repository.readBestNearby,
    getStationList: repository.readStationList,
    getStationsInBounds: repository.readStationsInBounds,
    getAreaBounds: repository.readAreaBounds,
    getSeoLocationOverview: repository.readSeoLocationOverview,
    getSitemapLocations: repository.readSitemapLocations,
  }
}
