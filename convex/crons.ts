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

crons.interval(
  'resume-stale-national-refresh',
  { minutes: 15 },
  internal.ingestion.resumeStaleDailyQueue,
  {},
)

crons.daily(
  'purge-old-ingestion-runs',
  { hourUTC: 8, minuteUTC: 30 },
  internal.ingestion.startIngestionRetention,
  {},
)

crons.daily(
  'retry-stale-failed-geocodes',
  { hourUTC: 8, minuteUTC: 45 },
  internal.ingestion.requeueStaleFailedGeocodes,
  {},
)

crons.daily(
  'purge-scheduled-account-deletions',
  { hourUTC: 9, minuteUTC: 0 },
  internal.accountDeletion.purgeDue,
  {},
)

export default crons
