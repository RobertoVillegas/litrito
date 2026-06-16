// Coarse latitude bucket for the 2D nearby search. Stations are indexed by
// [latBucket, longitude]; a radius query iterates the few buckets covering its
// latitude band and, within each, range-scans the longitude box — so it reads
// only the cells around the user instead of the whole country-wide latitude
// band. ~0.1° ≈ 11 km per bucket.
export const GEO_BUCKET_STEP = 0.1

export function latBucketFor(latitude: number): number {
  return Math.floor(latitude / GEO_BUCKET_STEP)
}
