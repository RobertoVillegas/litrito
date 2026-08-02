import { describe, expect, it } from 'vitest'
import { annotatePriceQuality, isPricePlausible } from './price-quality'

describe('price quality', () => {
  it('keeps CNE values while marking outliers', () => {
    expect(isPricePlausible(14.99)).toBe(false)
    expect(isPricePlausible(15)).toBe(true)
    expect(isPricePlausible(50)).toBe(true)
    expect(isPricePlausible(50.01)).toBe(false)
    expect(annotatePriceQuality({ regular: { price: 2 } })).toEqual({
      regular: { price: 2, isPlausible: false },
    })
  })
})
