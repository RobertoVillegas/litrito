import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.daily(
  'fetch-cne-gas-prices-1815-mexico-city',
  { hourUTC: 0, minuteUTC: 15 },
  internal.ingestion.queueDailyRefresh,
  {},
)

crons.daily(
  'retry-cne-gas-prices-1830-mexico-city',
  { hourUTC: 0, minuteUTC: 30 },
  internal.ingestion.queueDailyRefresh,
  {},
)

crons.daily(
  'retry-cne-gas-prices-1900-mexico-city',
  { hourUTC: 1, minuteUTC: 0 },
  internal.ingestion.queueDailyRefresh,
  {},
)

crons.daily(
  'retry-cne-gas-prices-2000-mexico-city',
  { hourUTC: 2, minuteUTC: 0 },
  internal.ingestion.queueDailyRefresh,
  {},
)

crons.daily(
  'geocode-stations-2100-mexico-city',
  { hourUTC: 3, minuteUTC: 0 },
  internal.ingestion.runNationalBulkRefresh,
  {},
)

crons.daily(
  'rebuild-filter-options-cache-2130-mexico-city',
  { hourUTC: 3, minuteUTC: 30 },
  internal.stations.rebuildFilterOptionsCache,
  {},
)

export default crons
