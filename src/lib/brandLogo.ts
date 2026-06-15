// Brand → logo asset for the station photo cascade. Drop logo files into
// `public/brands/` and add the mapping here, e.g.:
//
//   pemex: '/brands/pemex.svg',
//   'oxxo gas': '/brands/oxxo-gas.svg',
//
// Keys are lowercased/trimmed brand names. Empty until logo assets exist and
// the brand pipeline projects a reviewed brand onto public stations; the
// StationPhoto cascade falls through to a Mapillary photo meanwhile.
const BRAND_LOGOS: Record<string, string> = {}

export function brandLogo(brand?: string | null): string | undefined {
  if (!brand) return undefined
  return BRAND_LOGOS[brand.trim().toLowerCase()]
}
