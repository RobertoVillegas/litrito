export type StationCursor =
  | { kind: 'offset'; offset: number }
  | { kind: 'name'; name: string; permitNumber: string }
  | {
      kind: 'price'
      qualityRank: number
      price: number
      name: string
      permitNumber: string
    }
  | {
      kind: 'distance'
      coordinateRank: number
      distanceKm: number
      permitNumber: string
    }

export function encodeStationCursor(cursor: StationCursor) {
  return `v1:${encodeURIComponent(JSON.stringify(cursor))}`
}

export function decodeStationCursor(value: string | null | undefined): StationCursor | null {
  if (!value) return null
  if (!value.startsWith('v1:')) {
    const offset = Number.parseInt(value.replace(/^\D+/, ''), 10)
    return Number.isFinite(offset) && offset >= 0 ? { kind: 'offset', offset } : null
  }
  if (value.length > 2_048) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice(3))) as Partial<StationCursor>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.kind !== 'string') return null
    if (
      parsed.kind === 'offset' &&
      typeof parsed.offset === 'number' &&
      Number.isSafeInteger(parsed.offset) &&
      parsed.offset >= 0
    ) return parsed as StationCursor
    if (
      parsed.kind === 'name' &&
      typeof parsed.name === 'string' &&
      typeof parsed.permitNumber === 'string'
    ) return parsed as StationCursor
    if (
      parsed.kind === 'price' &&
      typeof parsed.qualityRank === 'number' &&
      typeof parsed.price === 'number' &&
      Number.isFinite(parsed.price) &&
      typeof parsed.name === 'string' &&
      typeof parsed.permitNumber === 'string'
    ) return parsed as StationCursor
    if (
      parsed.kind === 'distance' &&
      typeof parsed.coordinateRank === 'number' &&
      typeof parsed.distanceKm === 'number' &&
      Number.isFinite(parsed.distanceKm) &&
      typeof parsed.permitNumber === 'string'
    ) return parsed as StationCursor
    return null
  } catch {
    return null
  }
}
