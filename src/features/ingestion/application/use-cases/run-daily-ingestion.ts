import type { CneSource } from '../ports/cne-source'
import type { IngestionRepository } from '../ports/ingestion-repository'
import type { SnapshotKind } from '../../domain/ingestion'

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Error desconocido de ingestion'

export class RunDailyIngestion {
  constructor(
    private readonly source: CneSource,
    private readonly repository: IngestionRepository,
    private readonly batchSize = 50,
  ) {}

  async enqueue() {
    const catalog = await this.source.fetchCatalog()
    await this.repository.applyCatalog(catalog)
    const queued = await this.repository.enqueueDailyRun(catalog)
    if (queued) await this.captureSnapshots()
    return queued
  }

  private async captureSnapshots() {
    for (const kind of ['cne_prices_xml', 'cne_places_xml'] as SnapshotKind[]) {
      let sourceUrl: string = kind
      try {
        const snapshot = await this.source.fetchXmlSnapshot(kind)
        sourceUrl = snapshot.sourceUrl
        if (snapshot.places.length > 0) {
          await this.repository.applyPlaces(snapshot.places, 50)
        }
        await this.repository.recordSnapshot(snapshot)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Snapshot XML falló'
        await this.repository.recordSnapshotFailure(kind, sourceUrl, message)
        console.error(`[ingestion] ${kind}: ${message}`)
      }
    }
  }

  async drain(): Promise<{ claimed: number; failed: number }> {
    let claimed = 0
    let failed = 0
    while (true) {
      const tasks = await this.repository.claimMunicipalityBatch(this.batchSize)
      if (tasks.length === 0) break
      claimed += tasks.length
      const parentIds = new Set<string>()
      for (const task of tasks) {
        parentIds.add(task.parentRunId)
        try {
          const response = await this.source.fetchMunicipalityPrices(
            task.stateExternalId,
            task.municipalityExternalId,
          )
          if (response.mismatches > 0) {
            console.warn(
              `[ingestion] ${response.mismatches} filas fuera del municipio ${task.stateExternalId}/${task.municipalityExternalId}`,
            )
          }
          await this.repository.applyMunicipalityPrices(
            task,
            response.sourceUrl,
            response.rows,
          )
        } catch (error) {
          failed += 1
          await this.repository.failTask(task, errorMessage(error))
        }
      }
      await this.repository.finishParentRuns([...parentIds])
    }
    if (claimed > 0) await this.repository.rebuildReadCaches()
    return { claimed, failed }
  }

  resumeStale(staleAfterMinutes = 30) {
    return this.repository.resumeStaleTasks(staleAfterMinutes)
  }

  runMaintenance() {
    return this.repository.runMaintenance()
  }
}
