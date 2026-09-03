import { MapContainer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LitritoBasemap } from './LitritoBasemap'

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
        <LitritoBasemap />
        <Marker position={[latitude, longitude]} icon={STATION_ICON} />
      </MapContainer>
    </div>
  )
}

export default StationMiniMap
