import { describe, expect, it } from 'vitest'
import { decodeStationCursor, encodeStationCursor } from './pagination-cursor'

describe('station pagination cursor', () => {
  it('round-trips a keyset cursor with accented names', () => {
    const cursor = { kind: 'name' as const, name: 'Estación México', permitNumber: 'PL/1' }
    expect(decodeStationCursor(encodeStationCursor(cursor))).toEqual(cursor)
  })

  it('accepts legacy offset cursors during rollout', () => {
    expect(decodeStationCursor('o:40')).toEqual({ kind: 'offset', offset: 40 })
  })

  it('rejects malformed and oversized cursors', () => {
    expect(decodeStationCursor('v1:%7B%22kind%22%3A%22name%22%7D')).toBeNull()
    expect(decodeStationCursor(`v1:${'x'.repeat(2_049)}`)).toBeNull()
  })
})
