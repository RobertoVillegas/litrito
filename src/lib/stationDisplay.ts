// UI-level switch for enrichment-derived names and brands. The underlying
// provenance stays intact so the reviewed data can be enabled later.
export const SHOW_STATION_ENRICHMENT = false
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
