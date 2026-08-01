import { RunDailyIngestion } from './application/use-cases/run-daily-ingestion'
import { CneHttpSource } from './infrastructure/cne-http-source'
import { PostgresIngestionRepository } from './infrastructure/postgres-ingestion-repository'

export function createIngestionModule(batchSize = 50) {
  return new RunDailyIngestion(
    new CneHttpSource(),
    new PostgresIngestionRepository(),
    batchSize,
  )
}
