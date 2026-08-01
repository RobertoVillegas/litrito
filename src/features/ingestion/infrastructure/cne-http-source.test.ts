import { describe, expect, it } from 'vitest'
import {
  municipalityId,
  normalizeFuelType,
  normalizeText,
  parsePlaceRows,
  stateId,
} from './cne-http-source'

describe('normalización CNE', () => {
  it('mantiene los identificadores CNE normalizados', () => {
    expect(stateId(1)).toBe('01')
    expect(municipalityId(7)).toBe('007')
    expect(normalizeText('  San   José  ')).toBe('San José')
  })

  it('extrae ubicaciones del XML de places y descarta coordenadas inválidas', () => {
    const xml = '<places><place place_id="p1"><cre_id>PL/123/EXP/ES/2015</cre_id><name>Centro</name><location><x>-99.13</x><y>19.43</y></location></place><place place_id="bad"><cre_id>PL/9</cre_id><location><x>no</x><y>19</y></location></place></places>'
    expect(parsePlaceRows(xml)).toEqual([{
      placeId: 'p1', permitNumber: 'PL/123/EXP/ES/2015', name: 'Centro',
      latitude: 19.43, longitude: -99.13,
    }])
  })

  it('clasifica combustibles con y sin acentos', () => {
    expect(normalizeFuelType('Gasolina', 'Mínimo de 87 octanos')).toBe('regular')
    expect(normalizeFuelType('Gasolina', 'Premium mínimo de 91')).toBe('premium')
    expect(normalizeFuelType('Diésel', 'Ultra bajo azufre DUBA')).toBe('duba')
  })
})
