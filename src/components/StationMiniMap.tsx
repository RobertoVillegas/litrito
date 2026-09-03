import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

function createStationMarker(): HTMLDivElement {
  const marker = document.createElement('div')
  marker.className = 'litrito-marker'
  marker.setAttribute('aria-label', 'Ubicación de la estación')
  marker.setAttribute('role', 'img')
  marker.innerHTML =
    '<div class="litrito-marker__pin litrito-marker__pin--station"><span>⛽</span></div>'
  return marker
}

export function StationMiniMap({
  latitude,
  longitude,
}: {
  latitude: number
  longitude: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      center: [longitude, latitude],
      container: containerRef.current,
      cooperativeGestures: true,
      pitchWithRotate: false,
      scrollZoom: false,
      style: MAP_STYLE_URL,
      zoom: 15,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    const marker = new Marker({ element: createStationMarker() })
      .setLngLat([longitude, latitude])
      .addTo(map)

    return () => {
      marker.remove()
      map.remove()
    }
  }, [latitude, longitude])

  return (
    <div className="litrito-map-shell h-[320px] overflow-hidden rounded-[6px] border border-line">
      <div
        aria-label="Mapa de ubicación de la estación"
        className="h-full w-full"
        ref={containerRef}
      />
    </div>
  )
}

export default StationMiniMap
