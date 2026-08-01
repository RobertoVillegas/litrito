export type FuelType = 'regular' | 'premium' | 'diesel' | 'duba' | 'unknown'

export type CatalogState = { externalId: string; name: string }
export type CatalogMunicipality = {
  externalId: string
  stateExternalId: string
  name: string
}
export type Catalog = {
  states: CatalogState[]
  municipalities: CatalogMunicipality[]
}

export type MunicipalityTask = {
  id: string
  parentRunId: string
  stateExternalId: string
  municipalityExternalId: string
}

export type MunicipalityPrice = {
  permitNumber: string
  name: string
  address: string
  product: string
  subproduct: string
  fuelType: FuelType
  price: number
  stateExternalId: string
  municipalityExternalId: string
}

export type ApplyPricesResult = { recordsWritten: number; newStations: number }

export type CnePlace = {
  placeId: string
  permitNumber: string
  name: string
  latitude: number
  longitude: number
}

export type SnapshotKind = 'cne_prices_xml' | 'cne_places_xml'

export type CneXmlSnapshot = {
  kind: SnapshotKind
  sourceUrl: string
  contentLength: number
  placeCount: number
  priceCount: number
  sample: string
  places: CnePlace[]
}
