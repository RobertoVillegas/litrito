// Map-library-free geometry helpers and types. Kept separate from StationMap so
// routes can statically import these without dragging the browser-only renderer
// into the SSR bundle.

export type MapBounds = {
  swLat: number
  swLon: number
  neLat: number
  neLon: number
}

// A one-shot view target the map applies whenever its `key` changes: either a
// point (center + zoom in) or a bounding box to fit. Drives "focus on you",
// "focus on the selected state", and "focus on your favorites".
export type MapFocus =
  | { key: string; type: 'point'; lat: number; lon: number }
  // `force` re-frames even when the target is already on screen — used for
  // explicit state/municipality selections so picking a municipality zooms into
  // it instead of staying on the wider state view.
  | { key: string; type: 'bounds'; bounds: MapBounds; force?: boolean }

// Bounding box around a set of coordinates; null when none have lat/lng.
export function boundsOfLatLngs(
  coords: { latitude?: number; longitude?: number }[],
): MapBounds | null {
  let swLat = Infinity
  let swLon = Infinity
  let neLat = -Infinity
  let neLon = -Infinity
  let count = 0
  for (const c of coords) {
    if (typeof c.latitude !== 'number' || typeof c.longitude !== 'number') continue
    count += 1
    swLat = Math.min(swLat, c.latitude)
    neLat = Math.max(neLat, c.latitude)
    swLon = Math.min(swLon, c.longitude)
    neLon = Math.max(neLon, c.longitude)
  }
  if (count === 0) return null
  if (swLat === neLat && swLon === neLon) {
    // Single point: pad so fitBounds zooms to a neighbourhood, not max zoom.
    swLat -= 0.03
    neLat += 0.03
    swLon -= 0.03
    neLon += 0.03
  }
  return { swLat, swLon, neLat, neLon }
}
