export type FuelType = 'regular' | 'premium' | 'diesel' | 'duba' | 'unknown'

export const FUEL_META: Record<FuelType, { label: string; color: string }> = {
  regular: { label: 'Regular', color: '#10b981' },
  premium: { label: 'Premium', color: '#f59e0b' },
  diesel: { label: 'Diésel', color: '#475569' },
  duba: { label: 'Diésel bajo azufre', color: '#0284c7' },
  unknown: { label: 'Otro', color: '#bebebe' },
}

export const FUEL_ORDER: FuelType[] = ['regular', 'premium', 'diesel', 'duba', 'unknown']
