import { createPublicDataQueries } from './application/use-cases/public-data.queries'
import { drizzlePublicDataRepository } from './infrastructure/drizzle-public-data.repository'

// Explicit composition root: transport depends on use cases; only this module
// knows which infrastructure adapter implements the application port.
export const publicDataModule = createPublicDataQueries(
  drizzlePublicDataRepository,
)
