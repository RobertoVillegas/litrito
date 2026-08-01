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

const convexKey = <T extends Record<string, unknown>>(name: string, args: T) =>
  ['convexQuery', name, args] as const

export const publicQueryOptions = {
  filterOptions: () =>
    queryOptions({
      queryKey: convexKey('stations:listFilterOptions', {}),
      queryFn: () => getFilterOptions(),
      staleTime: 15 * 60 * 1_000,
    }),
  metrics: () =>
    queryOptions({
      queryKey: convexKey('metrics:getMetrics', {}),
      queryFn: () => getMetrics(),
      staleTime: 15 * 60 * 1_000,
    }),
  latestRun: () =>
    queryOptions({
      queryKey: convexKey('prices:latestRun', {}),
      queryFn: () => getLatestPriceRun(),
      staleTime: 5 * 60 * 1_000,
    }),
  stationDetail: (args: { permitNumber: string }) =>
    queryOptions({
      queryKey: convexKey('stations:getStationDetail', args),
      queryFn: () => getStationDetail({ data: args }),
      staleTime: 5 * 60 * 1_000,
    }),
  stationsByPermits: (args: { permitNumbers: string[] }) =>
    queryOptions({
      queryKey: convexKey('stations:getStationsByPermits', args),
      queryFn: () => getStationsByPermits({ data: args }),
      staleTime: 5 * 60 * 1_000,
    }),
  bestNearby: (args: Parameters<typeof getBestNearbyStations>[0]['data']) =>
    queryOptions({
      queryKey: convexKey('stations:bestNearbyStations', args),
      queryFn: () => getBestNearbyStations({ data: args }),
      staleTime: 60 * 1_000,
    }),
  stationList: (args: ListStationsInput) =>
    queryOptions({
      queryKey: convexKey('stations:listStations', args),
      queryFn: () => getStationList({ data: args }),
      staleTime: 60 * 1_000,
    }),
  stationsInBounds: (args: BoundsInput) =>
    queryOptions({
      queryKey: convexKey('stations:listStationsInBounds', args),
      queryFn: () => getStationsInBounds({ data: args }),
      staleTime: 60 * 1_000,
    }),
  areaBounds: (args: {
    stateExternalId?: string
    municipalityExternalId?: string
  }) =>
    queryOptions({
      queryKey: convexKey('stations:areaBounds', args),
      queryFn: () => getAreaBounds({ data: args }),
      staleTime: 60 * 60 * 1_000,
    }),
  seoLocation: (args: { stateSlug: string; municipalitySlug?: string }) =>
    queryOptions({
      queryKey: convexKey('stations:seoLocationOverview', args),
      queryFn: () => getSeoLocationOverview({ data: args }),
      staleTime: 15 * 60 * 1_000,
    }),
}
