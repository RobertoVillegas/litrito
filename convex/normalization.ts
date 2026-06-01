export type FuelType = 'regular' | 'premium' | 'diesel' | 'duba' | 'unknown'

export function normalizeFuelType(product: string, subproduct: string): FuelType {
  const value = `${product} ${subproduct}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

  if (value.includes('duba') || value.includes('ultra bajo azufre')) {
    return 'duba'
  }

  if (value.includes('diesel')) {
    return 'diesel'
  }

  if (value.includes('premium') || value.includes('minimo de 91') || value.includes('minimo de 92')) {
    return 'premium'
  }

  if (value.includes('regular') || value.includes('minimo de 87') || value.includes('menor a 92')) {
    return 'regular'
  }

  return 'unknown'
}

export function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function stateId(value: string | number) {
  return String(value).padStart(2, '0')
}

export function municipalityId(value: string | number) {
  return String(value).padStart(3, '0')
}
