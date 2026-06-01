import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L, {
  type LatLngBoundsExpression,
  type LatLngExpression,
  type LatLngTuple,
} from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

type FuelType = 'regular' | 'premium' | 'diesel' | 'duba' | 'unknown'

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

type UserLocation = {
  latitude: number
  longitude: number
}

type Props = {
  rows: StationRow[]
  fuelType: FuelType
  userLocation?: UserLocation | null
}

const FUEL_LABEL: Record<FuelType, string> = {
  regular: 'Regular',
  premium: 'Premium',
  diesel: 'Diésel',
  duba: 'Diésel bajo azufre',
  unknown: 'Otro',
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

function buildIcon(
  price: number | null,
  allPrices: number[],
  dim: boolean,
): L.DivIcon {
  const color =
    price != null ? priceColor(price, allPrices) : '#94a3b8'
  const label =
    price != null ? `$${price.toFixed(2).replace(/\.00$/, '')}` : '–'
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

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 })
    }
  }, [bounds, map])
  return null
}

function LocateControl({ location }: { location: LatLngExpression | null }) {
  const map = useMap()

  useEffect(() => {
    if (!location) return
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
      L.DomEvent.on(button, 'click', () => {
        map.flyTo(location, 14, { duration: 0.7 })
      })
      return container
    }
    control.addTo(map)
    return () => {
      control.remove()
    }
  }, [map, location])

  return null
}

function LegendControl({
  fuelType,
  hasFuelPrices,
}: {
  fuelType: FuelType
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
        <div class="litrito-legend__title">${FUEL_LABEL[fuelType]}</div>
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
  }, [map, fuelType, hasFuelPrices])

  return null
}

export function StationMap({ rows, fuelType, userLocation }: Props) {
  const points = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            typeof row.station.latitude === 'number' &&
            typeof row.station.longitude === 'number',
        )
        .map((row) => ({
          ...row,
          latLng: [row.station.latitude as number, row.station.longitude as number] as LatLngTuple,
        })),
    [rows],
  )

  const allPrices = useMemo(
    () =>
      points
        .map((p) => p.prices[fuelType]?.price)
        .filter((p): p is number => typeof p === 'number'),
    [points, fuelType],
  )

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (points.length === 0) return null
    if (points.length === 1) {
      const only = points[0]?.latLng
      return only ? ([only, only] as LatLngBoundsExpression) : null
    }
    return points.map((p) => p.latLng) as LatLngBoundsExpression
  }, [points])

  if (points.length === 0) {
    return (
      <div className="flex h-[55vh] min-h-[320px] max-h-[640px] items-center justify-center rounded-md border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
        Sin coordenadas para mostrar en el mapa.
      </div>
    )
  }

  const userLatLng: LatLngTuple | null =
    userLocation ? [userLocation.latitude, userLocation.longitude] : null

  return (
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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {bounds && <FitBounds bounds={bounds} />}
        <LocateControl location={userLatLng} />
        <LegendControl
          fuelType={fuelType}
          hasFuelPrices={allPrices.length > 0}
        />
        {userLatLng && <Marker position={userLatLng} icon={USER_ICON} />}
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom
          maxClusterRadius={50}
        >
          {points.map((row) => {
            const fuelPrice = row.prices[fuelType]?.price
            const hasFuelPrice = typeof fuelPrice === 'number'
            const displayPrice = hasFuelPrice
              ? fuelPrice
              : row.highlightedPrice
            const station = row.station
            const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${row.latLng[0]},${row.latLng[1]}`
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
                    {hasFuelPrice ? (
                      <div className="litrito-popup__price">
                        <span className="litrito-popup__fuel">
                          {FUEL_LABEL[fuelType]}
                        </span>
                        <span className="litrito-popup__amount">
                          {formatCurrency(fuelPrice)}
                        </span>
                      </div>
                    ) : (
                      <div className="litrito-popup__price litrito-popup__price--missing">
                        <span className="litrito-popup__fuel">
                          {FUEL_LABEL[fuelType]}
                        </span>
                        <span className="litrito-popup__amount">Sin precio</span>
                      </div>
                    )}
                    <a
                      className="litrito-popup__cta"
                      href={directionsHref}
                      target="_blank"
                      rel="noreferrer"
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
  )
}

export default StationMap
