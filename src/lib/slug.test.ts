import { describe, expect, it } from 'vitest'
import { slugifyLocationName } from './slug'

describe('slugifyLocationName', () => {
  it('normalizes accents and punctuation for stable SEO paths', () => {
    expect(slugifyLocationName('Michoacán de Ocampo')).toBe('michoacan-de-ocampo')
    expect(slugifyLocationName('San Luis Potosí!!!')).toBe('san-luis-potosi')
    expect(slugifyLocationName('  Álvaro Obregón  ')).toBe('alvaro-obregon')
  })
})
