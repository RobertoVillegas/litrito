import { TileLayer } from 'react-leaflet'
import { useMapTilerApiKey } from '../lib/map-config'

const MAPTILER_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'

export function LitritoBasemap() {
  const mapTilerApiKey = useMapTilerApiKey()

  if (!mapTilerApiKey) {
    return (
      <TileLayer
        attribution={OSM_ATTRIBUTION}
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    )
  }

  return (
    <TileLayer
      attribution={MAPTILER_ATTRIBUTION}
      crossOrigin
      minZoom={1}
      tileSize={512}
      url={`https://api.maptiler.com/maps/base-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(mapTilerApiKey)}`}
      zoomOffset={-1}
    />
  )
}
