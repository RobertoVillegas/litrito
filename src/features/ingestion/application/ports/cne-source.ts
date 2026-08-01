import type { Catalog, CneXmlSnapshot, MunicipalityPrice, SnapshotKind } from '../../domain/ingestion'

export interface CneSource {
  fetchCatalog(): Promise<Catalog>
  fetchMunicipalityPrices(
    stateExternalId: string,
    municipalityExternalId: string,
  ): Promise<{ sourceUrl: string; rows: MunicipalityPrice[]; mismatches: number }>
  fetchXmlSnapshot(kind: SnapshotKind): Promise<CneXmlSnapshot>
}
