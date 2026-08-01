import type { CneSource } from '../application/ports/cne-source'
import type {
  Catalog,
  CnePlace,
  CneXmlSnapshot,
  FuelType,
  MunicipalityPrice,
  SnapshotKind,
} from '../domain/ingestion'

const CATALOG_URL = 'https://api-catalogo.cne.gob.mx/api/utiles'
const REPORT_URL = 'https://api-reportediario.cne.gob.mx/api/EstacionServicio/Petroliferos'
const XML_URLS: Record<SnapshotKind, string> = {
  cne_prices_xml: 'https://publicacionexterna.azurewebsites.net/publicaciones/prices',
  cne_places_xml: 'https://publicacionexterna.azurewebsites.net/publicaciones/places',
}
const MAX_XML_BYTES = 128 * 1024 * 1024

type Envelope<T> = { Success: boolean; Errors: unknown; Value: T }
type CneState = { EntidadFederativaId: string | number; Nombre: string }
type CneMunicipality = {
  MunicipioId: string | number
  EntidadFederativaId: string | number
  Nombre: string
}
type CnePrice = {
  Numero: string
  Direccion: string
  Producto: string
  SubProducto: string
  PrecioVigente: number
  EntidadFederativaId: string | number
  MunicipioId: string | number
  Nombre: string
}

export const normalizeText = (value: unknown) =>
  String(value ?? '').replace(/\s+/g, ' ').trim()
export const stateId = (value: string | number) => String(value).padStart(2, '0')
export const municipalityId = (value: string | number) =>
  String(value).padStart(3, '0')

export function normalizeFuelType(product: string, subproduct: string): FuelType {
  const value = `${product} ${subproduct}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
  if (value.includes('duba') || value.includes('ultra bajo azufre')) return 'duba'
  if (value.includes('diesel')) return 'diesel'
  if (value.includes('premium') || value.includes('minimo de 91') || value.includes('minimo de 92')) return 'premium'
  if (value.includes('regular') || value.includes('minimo de 87') || value.includes('menor a 92')) return 'regular'
  return 'unknown'
}

export function parsePlaceRows(xml: string): CnePlace[] {
  const places: CnePlace[] = []
  for (const match of xml.matchAll(/<place\s+place_id="([^"]+)">([\s\S]*?)<\/place>/g)) {
    const body = match[2] ?? ''
    const permitNumber = normalizeText(body.match(/<cre_id>([\s\S]*?)<\/cre_id>/)?.[1])
    const name = normalizeText(body.match(/<name>([\s\S]*?)<\/name>/)?.[1])
    const location = body.match(/<location>([\s\S]*?)<\/location>/)?.[1] ?? body
    const longitude = Number(location.match(/<x>([\s\S]*?)<\/x>/)?.[1])
    const latitude = Number(location.match(/<y>([\s\S]*?)<\/y>/)?.[1])
    if (!permitNumber || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    places.push({ placeId: match[1] ?? '', permitNumber, name, latitude, longitude })
  }
  return places
}

function unwrap<T>(body: unknown, context: string): T {
  if (Array.isArray(body)) return body as T
  if (body && typeof body === 'object' && 'Success' in body && 'Value' in body) {
    const envelope = body as Envelope<T>
    if (envelope.Success) return envelope.Value
    throw new Error(`CNE reportó error (${context}): ${String(envelope.Errors)}`)
  }
  throw new Error(`CNE envelope inválido (${context})`)
}

async function fetchJson<T>(url: string, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { accept: 'application/json', 'user-agent': 'Litrito/1.0 (+https://litrito.com)' },
      })
      if (!response.ok) throw new Error(`CNE request failed: ${response.status}`)
      return (await response.json()) as T
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
      }
    }
  }
  throw lastError
}

export class CneHttpSource implements CneSource {
  async fetchXmlSnapshot(kind: SnapshotKind): Promise<CneXmlSnapshot> {
    const sourceUrl = XML_URLS[kind]
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        accept: 'application/xml,text/xml,*/*',
        'user-agent': 'Litrito/1.0 (+https://litrito.com)',
        origin: 'https://www.cne.gob.mx',
        referer: 'https://www.cne.gob.mx/',
      },
    })
    if (!response.ok) throw new Error(`XML request failed: ${response.status} ${response.statusText}`)
    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_XML_BYTES) throw new Error(`XML excede límite de ${MAX_XML_BYTES} bytes`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_XML_BYTES) throw new Error(`XML excede límite de ${MAX_XML_BYTES} bytes`)
    const xml = new TextDecoder().decode(bytes)
    const places = kind === 'cne_places_xml' ? parsePlaceRows(xml) : []
    return {
      kind,
      sourceUrl,
      contentLength: bytes.byteLength,
      placeCount: (xml.match(/<place\b/g) ?? []).length,
      priceCount: (xml.match(/<gas_price\b/g) ?? []).length,
      sample: xml.slice(0, 1_800),
      places,
    }
  }

  async fetchCatalog(): Promise<Catalog> {
    const states = unwrap<CneState[]>(
      await fetchJson(`${CATALOG_URL}/entidadesfederativas`),
      'entidadesfederativas',
    )
    const municipalities: Catalog['municipalities'] = []
    for (const state of states) {
      const externalId = stateId(state.EntidadFederativaId)
      const rows = unwrap<CneMunicipality[]>(
        await fetchJson(`${CATALOG_URL}/municipios?EntidadFederativaId=${externalId}`),
        `municipios/${externalId}`,
      )
      municipalities.push(...rows.map((row) => ({
        externalId: municipalityId(row.MunicipioId),
        stateExternalId: stateId(row.EntidadFederativaId),
        name: normalizeText(row.Nombre),
      })))
    }
    return {
      states: states.map((row) => ({
        externalId: stateId(row.EntidadFederativaId),
        name: normalizeText(row.Nombre),
      })),
      municipalities,
    }
  }

  async fetchMunicipalityPrices(stateExternalId: string, municipalityExternalId: string) {
    const sourceUrl = `${REPORT_URL}?entidadId=${stateExternalId}&municipioId=${municipalityExternalId}`
    const source = unwrap<CnePrice[]>(await fetchJson(sourceUrl), sourceUrl)
    const seen = new Set<string>()
    const rows: MunicipalityPrice[] = []
    let mismatches = 0
    for (const row of source ?? []) {
      const state = stateId(row.EntidadFederativaId)
      const municipality = municipalityId(row.MunicipioId)
      if (state !== stateExternalId || municipality !== municipalityExternalId) {
        mismatches += 1
        continue
      }
      const product = normalizeText(row.Producto)
      const subproduct = normalizeText(row.SubProducto)
      const permitNumber = normalizeText(row.Numero)
      const fuelType = normalizeFuelType(product, subproduct)
      const price = Number(row.PrecioVigente)
      const key = `${permitNumber}:${fuelType}`
      if (!permitNumber || !Number.isFinite(price) || price <= 0 || seen.has(key)) continue
      seen.add(key)
      rows.push({
        permitNumber,
        name: normalizeText(row.Nombre) || 'Estación sin nombre',
        address: normalizeText(row.Direccion) || 'Dirección no disponible',
        product,
        subproduct,
        fuelType,
        price,
        stateExternalId: state,
        municipalityExternalId: municipality,
      })
    }
    return { sourceUrl, rows, mismatches }
  }
}
