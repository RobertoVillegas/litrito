// Deterministic brand extraction from the CNE legal/permit-holder name. Free and
// instant, but limited: it only catches brands whose legal entity name contains
// the consumer brand (vertically integrated chains like Hidrosina, Orsan,
// Gazpro, G500). Most Pemex stations are franchised under unrelated company
// names, so those need OSM / Places enrichment instead. Pure module (no Convex
// server imports) so it can be used on both the backend and the frontend.

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// brand → regex matched (word-boundary) against the normalized legal name.
// Order matters: first match wins, so list more specific brands first.
const BRAND_PATTERNS: Array<{ brand: string; re: RegExp }> = [
  { brand: 'Hidrosina', re: /\bhidrosina\b/ },
  { brand: 'Petro-7', re: /\bpetro[\s-]?7\b|\bpetro\s?seven\b/ },
  { brand: 'Oxxo Gas', re: /\boxxo\b/ },
  { brand: 'G500', re: /\bg\s?500\b/ },
  { brand: 'Rendichicas', re: /\brendichicas?\b/ },
  { brand: 'Orsan', re: /\borsan\b/ },
  { brand: 'Gazpro', re: /\bgazpro\b/ },
  { brand: 'Redco', re: /\bredco\b/ },
  { brand: 'Akron', re: /\bakron\b/ },
  { brand: 'FullGas', re: /\bfull\s?gas\b/ },
  { brand: 'Petromax', re: /\bpetromax\b/ },
  { brand: 'La Gas', re: /\bla\s?gas\b/ },
  { brand: 'Combured', re: /\bcombured\b/ },
  { brand: 'Energ', re: /\bener[gj]\b/ },
  { brand: 'Mobil', re: /\bmobil\b/ },
  { brand: 'Shell', re: /\bshell\b/ },
  { brand: 'BP', re: /\bbp\b/ },
  { brand: 'Repsol', re: /\brepsol\b/ },
  { brand: 'Chevron', re: /\bchevron\b/ },
  { brand: 'TotalEnergies', re: /\btotal\s?energies\b/ },
  { brand: 'Gulf', re: /\bgulf\b/ },
  { brand: 'Arco', re: /\barco\b/ },
  { brand: 'Pemex', re: /\bpemex\b/ },
]

export function brandFromLegalName(name: string | null | undefined): string | null {
  if (!name) return null
  const normalized = normalize(name)
  for (const { brand, re } of BRAND_PATTERNS) {
    if (re.test(normalized)) return brand
  }
  return null
}
