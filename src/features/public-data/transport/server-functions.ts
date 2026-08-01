import { createServerFn } from '@tanstack/react-start'
import { publicDataModule } from '../public-data.module'
import type {
  BoundsInput,
  ListStationsInput,
  NearbyStationsInput,
} from '../application/dtos/public-data.dto'

export const getFilterOptions = createServerFn({ method: 'GET' }).handler(
  publicDataModule.getFilterOptions,
)

export const getMetrics = createServerFn({ method: 'GET' }).handler(
  publicDataModule.getMetrics,
)

export const getLatestPriceRun = createServerFn({ method: 'GET' }).handler(
  publicDataModule.getLatestPriceRun,
)

export const getStationHistory = createServerFn({ method: 'GET' })
  .inputValidator((data: { permitNumber: string }) => data)
  .handler(({ data }) => publicDataModule.getStationHistory(data.permitNumber))

export const getStationDetail = createServerFn({ method: 'GET' })
  .inputValidator((data: { permitNumber: string }) => data)
  .handler(({ data }) => publicDataModule.getStationDetail(data.permitNumber))

export const getStationsByPermits = createServerFn({ method: 'GET' })
  .inputValidator((data: { permitNumbers: string[] }) => data)
  .handler(({ data }) => publicDataModule.getStationsByPermits(data.permitNumbers))

export const getBestNearbyStations = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: NearbyStationsInput) => data,
  )
  .handler(({ data }) => publicDataModule.getBestNearbyStations(data))

export const getStationList = createServerFn({ method: 'GET' })
  .inputValidator((data: ListStationsInput) => data)
  .handler(({ data }) => publicDataModule.getStationList(data))

export const getStationsInBounds = createServerFn({ method: 'GET' })
  .inputValidator((data: BoundsInput) => data)
  .handler(({ data }) => publicDataModule.getStationsInBounds(data))

export const getAreaBounds = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { stateExternalId?: string; municipalityExternalId?: string }) => data,
  )
  .handler(({ data }) => publicDataModule.getAreaBounds(data))

export const getSeoLocationOverview = createServerFn({ method: 'GET' })
  .inputValidator((data: { stateSlug: string; municipalitySlug?: string }) => data)
  .handler(({ data }) => publicDataModule.getSeoLocationOverview(data))

export const getSitemapLocations = createServerFn({ method: 'GET' }).handler(
  publicDataModule.getSitemapLocations,
)
