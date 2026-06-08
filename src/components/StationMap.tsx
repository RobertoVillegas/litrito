import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L, {
  type LatLngBoundsExpression,
  type LatLngExpression,
  type LatLngTuple,
} from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { FuelType } from './StationFilters'

type Station = {
  permitNumber: string
  name: string
  address: string
  municipalityName?: string
  stateName?: string
  latitude?: number
  longitude?: number
}

type StationRow = {
  station: Station
  prices: Partial<Record<FuelType, { price: number }>>
  highlightedPrice: number | null
}

export type MapBounds = {
  swLat: number
  swLon: number
  neLat: number
  neLon: number
}

type UserLocation = {
  latitude: number
  longitude: number
}

type Props = {
  rows: StationRow[]
  primaryFuel: FuelType
  fuelTypes: FuelType[]
  userLocation?: UserLocation | null
  truncated?: boolean
  autoCenterOnUserLocation?: boolean
  initialBounds?: MapBounds | null
  onMoveEnd?: (bounds: MapBounds) => void
  onLocateClick?: () => void
}

const FUEL_LABEL: Record<FuelType, string> = {
  regular: 'Regular',
  premium: 'Premium',
  diesel: 'Diésel',
  duba: 'Diésel bajo azufre',
}

const MEXICO_CENTER: LatLngTuple = [23.6345, -102.5528]
const MEXICO_BOUNDS: LatLngBoundsExpression = [
  [14.5, -118.5],
  [32.7, -86.5],
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function priceColor(price: number, allPrices: number[]): string {
  if (allPrices.length === 0) return '#0f766e'
  const min = Math.min(...allPrices)
  const max = Math.max(...allPrices)
  if (min === max) return '#0f766e'
  const ratio = (price - min) / (max - min)
  if (ratio < 0.34) return '#15803d'
  if (ratio < 0.67) return '#ca8a04'
  return '#b91c1c'
}

function buildIcon(price: number | null, allPrices: number[], dim: boolean): L.DivIcon {
  const color = price != null ? priceColor(price, allPrices) : '#94a3b8'
  const label = price != null ? `$${price.toFixed(2).replace(/\.00$/, '')}` : '–'
  const dimClass = dim ? ' litrito-marker__pin--dim' : ''
  return L.divIcon({
    className: 'litrito-marker',
    html: `<div style="background:${color}" class="litrito-marker__pin${dimClass}"><span>${label}</span></div>`,
    iconSize: [44, 28],
    iconAnchor: [22, 14],
    popupAnchor: [0, -14],
  })
}

const USER_ICON = L.divIcon({
  className: 'litrito-user-marker',
  html: '<div class="litrito-user-marker__pulse"></div><div class="litrito-user-marker__dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function MoveWatcher({ onMoveEnd }: { onMoveEnd: (b: MapBounds) => void }) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const map = useMapEvents({
    moveend(e) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const b = e.target.getBounds()
        onMoveEnd({
          swLat: b.getSouth(),
          swLon: b.getWest(),
          neLat: b.getNorth(),
          neLon: b.getEast(),
        })
      }, 250)
    },
  })

  // Emit the initial viewport once on mount so the bounds-driven query can run
  // immediately — otherwise the map waits for a manual pan that never comes.
  useEffect(() => {
    const b = map.getBounds()
    onMoveEnd({
      swLat: b.getSouth(),
      swLon: b.getWest(),
      neLat: b.getNorth(),
      neLon: b.getEast(),
    })
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

function FitInitialBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap()
  const fittedRef = useRef(false)
  useEffect(() => {
    if (bounds && !fittedRef.current) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 })
      fittedRef.current = true
    }
  }, [bounds, map])
  return null
}

function AutoCenterOnUserLocation({
  location,
  enabled,
}: {
  location: LatLngTuple | null
  enabled: boolean
}) {
  const map = useMap()
  const lastCenteredRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !location) return
    const key = `${location[0].toFixed(6)},${location[1].toFixed(6)}`
    if (lastCenteredRef.current === key) return
    lastCenteredRef.current = key
    map.flyTo(location, Math.max(map.getZoom(), 14), { duration: 0.7 })
  }, [enabled, location, map])

  return null
}

function LocateControl({
  location,
  onClick,
}: {
  location: LatLngExpression | null
  onClick?: () => void
}) {
  const map = useMap()

  useEffect(() => {
    const control = new L.Control({ position: 'topright' })
    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'litrito-map-control')
      const button = L.DomUtil.create(
        'button',
        'litrito-map-control__btn',
        container,
      ) as HTMLButtonElement
      button.type = 'button'
      button.title = 'Centrar en mi ubicación'
      button.setAttribute('aria-label', 'Centrar en mi ubicación')
      button.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
      L.DomEvent.disableClickPropagation(container)
      L.DomEvent.on(button, 'click', (event) => {
        L.DomEvent.stop(event)
        if (location) {
          map.flyTo(location, 14, { duration: 0.7 })
        }
        onClick?.()
      })
      return container
    }
    control.addTo(map)
    return () => {
      control.remove()
    }
  }, [map, location, onClick])

  return null
}


function LegendControl({
  primaryFuel,
  hasFuelPrices,
}: {
  primaryFuel: FuelType
  hasFuelPrices: boolean
}) {
  const map = useMap()

  useEffect(() => {
    if (!hasFuelPrices) return
    const control = new L.Control({ position: 'bottomleft' })
    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'litrito-legend')
      L.DomEvent.disableClickPropagation(container)
      container.innerHTML = `
        <div class="litrito-legend__title">${FUEL_LABEL[primaryFuel]}</div>
        <div class="litrito-legend__row">
          <span class="litrito-legend__chip" style="background:#15803d"></span>
          <span>Más barato</span>
        </div>
        <div class="litrito-legend__row">
          <span class="litrito-legend__chip" style="background:#ca8a04"></span>
          <span>Promedio</span>
        </div>
        <div class="litrito-legend__row">
          <span class="litrito-legend__chip" style="background:#b91c1c"></span>
          <span>Más caro</span>
        </div>
      `
      return container
    }
    control.addTo(map)
    return () => {
      control.remove()
    }
  }, [map, primaryFuel, hasFuelPrices])

  return null
}

export function StationMap({
  rows,
  primaryFuel,
  fuelTypes,
  userLocation,
  truncated,
  autoCenterOnUserLocation,
  initialBounds,
  onMoveEnd,
  onLocateClick,
}: Props) {
  const points = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            typeof r.station.latitude === 'number' &&
            typeof r.station.longitude === 'number',
        )
        .map((r) => ({
          ...r,
          latLng: [r.station.latitude as number, r.station.longitude as number] as LatLngTuple,
        })),
    [rows],
  )

  const allPrices = useMemo(
    () =>
      points
        .map((p) => p.prices[primaryFuel]?.price)
        .filter((p): p is number => typeof p === 'number'),
    [points, primaryFuel],
  )

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (!initialBounds) return null
    return [
      [initialBounds.swLat, initialBounds.swLon],
      [initialBounds.neLat, initialBounds.neLon],
    ] as LatLngBoundsExpression
  }, [initialBounds])

  const userLatLng: LatLngTuple | null = userLocation
    ? [userLocation.latitude, userLocation.longitude]
    : null

  return (
    <div className="relative">
      <div className="h-[55vh] min-h-[320px] max-h-[640px] overflow-hidden rounded-md border border-slate-200">
        <MapContainer
          center={MEXICO_CENTER}
          zoom={5}
          minZoom={4}
          maxZoom={18}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
          maxBounds={MEXICO_BOUNDS}
          maxBoundsViscosity={0.8}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains={['a', 'b', 'c', 'd']}
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          {bounds && <FitInitialBounds bounds={bounds} />}
          <AutoCenterOnUserLocation
            location={userLatLng}
            enabled={Boolean(autoCenterOnUserLocation)}
          />
          {onMoveEnd && <MoveWatcher onMoveEnd={onMoveEnd} />}
          <LocateControl location={userLatLng} onClick={onLocateClick} />
          <LegendControl primaryFuel={primaryFuel} hasFuelPrices={allPrices.length > 0} />
          {userLatLng && <Marker position={userLatLng} icon={USER_ICON} />}
          <MarkerClusterGroup
            chunkedLoading
            showCoverageOnHover={false}
            spiderfyOnMaxZoom
            maxClusterRadius={50}
          >
            {points.map((row) => {
              const fuelPrice = row.prices[primaryFuel]?.price
              const hasFuelPrice = typeof fuelPrice === 'number'
              const displayPrice = hasFuelPrice ? fuelPrice : row.highlightedPrice
              const station = row.station
              const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${row.latLng[0]},${row.latLng[1]}`
              const visibleFuels = fuelTypes.filter((ft) => row.prices[ft]?.price != null)
              return (
                <Marker
                  key={station.permitNumber}
                  position={row.latLng}
                  icon={buildIcon(displayPrice, allPrices, !hasFuelPrice)}
                >
                  <Popup>
                    <div className="litrito-popup">
                      <div className="litrito-popup__title">{station.name}</div>
                      <div className="litrito-popup__addr">{station.address}</div>
                      {(station.municipalityName || station.stateName) && (
                        <div className="litrito-popup__loc">
                          {[station.municipalityName, station.stateName]
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      )}
                      {visibleFuels.length > 0 ? (
                        <div className="litrito-popup__prices">
                          {visibleFuels.map((ft) => (
                            <div key={ft} className="litrito-popup__price">
                              <span className="litrito-popup__fuel">
                                {FUEL_LABEL[ft]}
                              </span>
                              <span className="litrito-popup__amount">
                                {formatCurrency(row.prices[ft]!.price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="litrito-popup__price litrito-popup__price--missing">
                          <span className="litrito-popup__amount">Sin precios</span>
                        </div>
                      )}
                      <a
                        className="litrito-popup__cta"
                        href={directionsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Cómo llegar
                      </a>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
      {truncated && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-1 text-xs font-bold text-amber-800 shadow">
          Mostrando 800 · acércate para ver más
        </div>
      )}
      {points.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-bold text-slate-500 shadow">
          No hay estaciones en esta zona
        </div>
      )}
    </div>
  )
}

export default StationMap
