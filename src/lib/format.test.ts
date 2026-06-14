import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDistance } from './format'

describe('format helpers', () => {
  it('formats MXN currency consistently', () => {
    expect(formatCurrency(23.5)).toBe('$23.50')
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('formats distances in meters and kilometers', () => {
    expect(formatDistance(0.42)).toBe('420 m')
    expect(formatDistance(4.25)).toBe('4.3 km')
    expect(formatDistance(12.8)).toBe('13 km')
  })
})
