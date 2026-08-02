import { queryOptions } from '@tanstack/react-query'
import {
  getAreaBounds,
  getBestNearbyStations,
  getFilterOptions,
  getLatestPriceRun,
  getMetrics,
  getSeoLocationOverview,
  getStationDetail,
  getStationList,
  getStationsByPermits,
  getStationsInBounds,
} from '../transport/server-functions'
import type {
  BoundsInput,
  ListStationsInput,
} from '../application/dtos/public-data.dto'

// Keep the historical key shape so a rollout does not invalidate every cache at once.
const legacyQueryKey = <T extends Record<string, unknown>>(name: string, args: T) =>
  ['convexQuery', name, args] as const

export const publicQueryOptions = {
  filterOptions: () =>
    queryOptions({
      queryKey: legacyQueryKey('stations:listFilterOptions', {}),
      queryFn: () => getFilterOptions(),
      staleTime: 15 * 60 * 1_000,
    }),
  metrics: () =>
    queryOptions({
      queryKey: legacyQueryKey('metrics:getMetrics', {}),
      queryFn: () => getMetrics(),
      staleTime: 15 * 60 * 1_000,
    }),
  latestRun: () =>
    queryOptions({
      queryKey: legacyQueryKey('prices:latestRun', {}),
      queryFn: () => getLatestPriceRun(),
      staleTime: 5 * 60 * 1_000,
    }),
  stationDetail: (args: { permitNumber: string }) =>
    queryOptions({
      queryKey: legacyQueryKey('stations:getStationDetail', args),
      queryFn: () => getStationDetail({ data: args }),
      staleTime: 5 * 60 * 1_000,
    }),
  stationsByPermits: (args: { permitNumbers: string[] }) =>
    queryOptions({
      queryKey: legacyQueryKey('stations:getStationsByPermits', args),
      queryFn: () => getStationsByPermits({ data: args }),
      staleTime: 5 * 60 * 1_000,
    }),
  bestNearby: (args: Parameters<typeof getBestNearbyStations>[0]['data']) =>
    queryOptions({
      queryKey: legacyQueryKey('stations:bestNearbyStations', args),
      queryFn: () => getBestNearbyStations({ data: args }),
      staleTime: 60 * 1_000,
    }),
  stationList: (args: ListStationsInput) =>
    queryOptions({
      queryKey: legacyQueryKey('stations:listStations', args),
      queryFn: () => getStationList({ data: args }),
      staleTime: 60 * 1_000,
    }),
  stationsInBounds: (args: BoundsInput) =>
    queryOptions({
      queryKey: legacyQueryKey('stations:listStationsInBounds', args),
      queryFn: () => getStationsInBounds({ data: args }),
      staleTime: 60 * 1_000,
    }),
  areaBounds: (args: {
    stateExternalId?: string
    municipalityExternalId?: string
  }) =>
    queryOptions({
      queryKey: legacyQueryKey('stations:areaBounds', args),
      queryFn: () => getAreaBounds({ data: args }),
      staleTime: 60 * 60 * 1_000,
    }),
  seoLocation: (args: { stateSlug: string; municipalitySlug?: string }) =>
    queryOptions({
      queryKey: legacyQueryKey('stations:seoLocationOverview', args),
      queryFn: () => getSeoLocationOverview({ data: args }),
      staleTime: 15 * 60 * 1_000,
    }),
}
