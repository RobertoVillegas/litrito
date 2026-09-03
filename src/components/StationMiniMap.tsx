import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const STATION_ICON = L.divIcon({
  className: 'litrito-marker',
  html: '<div class="litrito-marker__pin" style="background:#e60000"><span>⛽</span></div>',
  iconSize: [44, 28],
  iconAnchor: [22, 14],
})

export function StationMiniMap({
  latitude,
  longitude,
}: {
  latitude: number
  longitude: number
}) {
  return (
    <div className="h-[320px] overflow-hidden rounded-[6px] border border-line">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]} icon={STATION_ICON} />
      </MapContainer>
    </div>
  )
}

export default StationMiniMap
