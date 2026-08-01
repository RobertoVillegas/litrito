import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import type {
  BoundsInput,
  ListStationsInput,
  NearbyStationsInput,
} from '../application/dtos/public-data.dto'

const getPublicDataModule = createServerOnlyFn(async () =>
  (await import('../public-data.module')).publicDataModule,
)

export const getFilterOptions = createServerFn({ method: 'GET' }).handler(
  async () => (await getPublicDataModule()).getFilterOptions(),
)

export const getMetrics = createServerFn({ method: 'GET' }).handler(
  async () => (await getPublicDataModule()).getMetrics(),
)

export const getLatestPriceRun = createServerFn({ method: 'GET' }).handler(
  async () => (await getPublicDataModule()).getLatestPriceRun(),
)

export const getStationHistory = createServerFn({ method: 'GET' })
  .inputValidator((data: { permitNumber: string }) => data)
  .handler(async ({ data }) =>
    (await getPublicDataModule()).getStationHistory(data.permitNumber))

export const getStationDetail = createServerFn({ method: 'GET' })
  .inputValidator((data: { permitNumber: string }) => data)
  .handler(async ({ data }) =>
    (await getPublicDataModule()).getStationDetail(data.permitNumber))

export const getStationsByPermits = createServerFn({ method: 'GET' })
  .inputValidator((data: { permitNumbers: string[] }) => data)
  .handler(async ({ data }) =>
    (await getPublicDataModule()).getStationsByPermits(data.permitNumbers))

export const getBestNearbyStations = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: NearbyStationsInput) => data,
  )
  .handler(async ({ data }) =>
    (await getPublicDataModule()).getBestNearbyStations(data))

export const getStationList = createServerFn({ method: 'GET' })
  .inputValidator((data: ListStationsInput) => data)
  .handler(async ({ data }) => (await getPublicDataModule()).getStationList(data))

export const getStationsInBounds = createServerFn({ method: 'GET' })
  .inputValidator((data: BoundsInput) => data)
  .handler(async ({ data }) =>
    (await getPublicDataModule()).getStationsInBounds(data))

export const getAreaBounds = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { stateExternalId?: string; municipalityExternalId?: string }) => data,
  )
  .handler(async ({ data }) => (await getPublicDataModule()).getAreaBounds(data))

export const getSeoLocationOverview = createServerFn({ method: 'GET' })
  .inputValidator((data: { stateSlug: string; municipalitySlug?: string }) => data)
  .handler(async ({ data }) =>
    (await getPublicDataModule()).getSeoLocationOverview(data))

export const getSitemapLocations = createServerFn({ method: 'GET' }).handler(
  async () => (await getPublicDataModule()).getSitemapLocations(),
)
