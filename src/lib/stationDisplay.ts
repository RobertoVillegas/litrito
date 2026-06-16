// UI-level switches to hide enrichment-derived names/brands and Mapillary
// photos without deleting any data. The `stationEnrichment` table and cached
// photos stay intact (full provenance preserved) — flip these to `true` to
// bring the features back. See docs/station-enrichment.md.
export const SHOW_STATION_ENRICHMENT = false
export const SHOW_STATION_PHOTOS = false

type EnrichmentLike =
  | { brand?: string | null; displayName?: string | null }
  | null
  | undefined

/** Public-facing station name. Falls back to the CNE razón social when
 * enrichment display is disabled. */
export function resolveStationName(
  stationName: string,
  enrichment?: EnrichmentLike,
): string {
  if (!SHOW_STATION_ENRICHMENT) return stationName
  return enrichment?.displayName || enrichment?.brand || stationName
}

/** Brand to badge/pass through, or undefined when enrichment is disabled. */
export function resolveStationBrand(enrichment?: EnrichmentLike): string | undefined {
  if (!SHOW_STATION_ENRICHMENT) return undefined
  return enrichment?.brand ?? undefined
}
