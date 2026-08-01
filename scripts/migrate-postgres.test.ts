import { describe, expect, it } from 'vitest'
import { copyCell, copyRow, normalizeDocument } from './migrate-postgres'

describe('Convex to PostgreSQL import mapping', () => {
  it('maps Convex metadata and parses JSON caches', () => {
    expect(
      normalizeDocument('metricsCache', {
        _id: 'metric-id',
        _creationTime: 1_725_000_000_000,
        key: 'default',
        data: '{"totalStations":42}',
        updatedAt: '2026-07-31T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'metric-id',
      convex_creation_time: 1_725_000_000_000,
      key: 'default',
      data: { totalStations: 42 },
      updated_at: '2026-07-31T00:00:00.000Z',
    })
  })

  it('converts deletion epoch milliseconds to timestamptz input', () => {
    const row = normalizeDocument('accountDeletions', {
      _id: 'deletion-id',
      _creationTime: 1,
      authUserId: 'user-id',
      email: 'person@example.com',
      requestedAt: '2026-07-31T00:00:00.000Z',
      scheduledAt: Date.parse('2026-08-15T00:00:00.000Z'),
    })

    expect(row.scheduled_at).toBe('2026-08-15T00:00:00.000Z')
  })

  it('preserves legacy photo metadata without migrating binary objects', () => {
    const row = normalizeDocument('stationPhotos', {
      _id: 'photo-id',
      _creationTime: 1,
      stationPermitNumber: 'PL/1/EXP/ES/2015',
      source: 'mapillary',
      status: 'found',
      storageId: 'kg-storage-id',
      checkedAt: '2026-07-31T00:00:00.000Z',
    })

    expect(row.legacy_storage_id).toBe('kg-storage-id')
    expect(row.object_key).toBeUndefined()
    expect(row).not.toHaveProperty('storage_id')
  })

  it('escapes COPY text and writes PostgreSQL null markers', () => {
    expect(copyCell(undefined)).toBe(String.raw`\N`)
    expect(copyCell('a\tb\nc\\d')).toBe(String.raw`a\tb\nc\\d`)
    expect(copyRow(['a', 'b'], { a: 1, b: null })).toBe(`1\t${String.raw`\N`}\n`)
  })
})
