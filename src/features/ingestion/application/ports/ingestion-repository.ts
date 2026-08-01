import type {
  ApplyPricesResult,
  Catalog,
  CnePlace,
  CneXmlSnapshot,
  MunicipalityPrice,
  MunicipalityTask,
} from '../../domain/ingestion'

export interface IngestionRepository {
  applyCatalog(catalog: Catalog): Promise<void>
  enqueueDailyRun(catalog: Catalog): Promise<{ runId: string; queued: number } | null>
  claimMunicipalityBatch(limit: number): Promise<MunicipalityTask[]>
  applyMunicipalityPrices(
    task: MunicipalityTask,
    sourceUrl: string,
    rows: MunicipalityPrice[],
  ): Promise<ApplyPricesResult>
  failTask(task: MunicipalityTask, message: string): Promise<void>
  finishParentRuns(parentIds: string[]): Promise<void>
  resumeStaleTasks(staleAfterMinutes: number): Promise<number>
  rebuildReadCaches(): Promise<void>
  applyPlaces(places: CnePlace[], batchSize: number): Promise<{ matched: number; updated: number }>
  recordSnapshot(snapshot: CneXmlSnapshot): Promise<void>
  recordSnapshotFailure(kind: string, sourceUrl: string, message: string): Promise<void>
  runMaintenance(): Promise<{ accountsPurged: number; runsPurged: number }>
}
