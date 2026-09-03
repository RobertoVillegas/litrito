import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Sentry from '@sentry/tanstackstart-react'
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FuelType } from './StationFilters'
import { AnimatedPrice } from './AnimatedNumber'
import { ComponentErrorBoundary } from './ComponentErrorBoundary'
import type { MapBounds, MapFocus } from './mapGeo'

export { boundsOfLatLngs } from './mapGeo'
export type { MapBounds, MapFocus } from './mapGeo'

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
  prices: Partial<Record<FuelType, { price: number; isPlausible?: boolean }>>
  highlightedPrice: number | null
  rank?: number
}

type MappedStationRow = StationRow & {
  latitude: number
  longitude: number
}

type StationFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: {
      color: string
      dimmed: boolean
      label: string
      permitNumber: string
    }
  }>
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
  focus?: MapFocus | null
  initialBounds?: MapBounds | null
  loading?: boolean
  markerMode?: 'price' | 'rank'
  onMoveEnd?: (bounds: MapBounds) => void
  onLocateClick?: () => void
}

const FUEL_LABEL: Record<FuelType, string> = {
  regular: 'Regular',
  premium: 'Premium',
  diesel: 'Diésel',
  duba: 'Diésel bajo azufre',
}

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const MEXICO_CENTER: [number, number] = [-102.5528, 23.6345]
const MEXICO_BOUNDS: LngLatBoundsLike = [
  [-118.5, 14.5],
  [-86.5, 32.7],
]
const SOURCE_ID = 'stations'
const CLUSTER_LAYER_ID = 'station-clusters'
const CLUSTER_COUNT_LAYER_ID = 'station-cluster-count'
const STATION_LAYER_ID = 'station-points'
const STATION_LABEL_LAYER_ID = 'station-labels'

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

function markerDetails(
  row: MappedStationRow,
  primaryFuel: FuelType,
  allPrices: number[],
  markerMode: 'price' | 'rank',
) {
  const selectedPrice = row.prices[primaryFuel]
  const fuelPrice = selectedPrice?.price
  const hasFuelPrice = typeof fuelPrice === 'number' && selectedPrice?.isPlausible !== false
  const displayPrice = hasFuelPrice ? fuelPrice : row.highlightedPrice
  const label =
    markerMode === 'rank' && typeof row.rank === 'number'
      ? String(row.rank)
      : displayPrice != null
        ? `$${displayPrice.toFixed(2).replace(/\.00$/, '')}`
        : '–'

  return {
    color: displayPrice != null ? priceColor(displayPrice, allPrices) : '#94a3b8',
    dimmed: !hasFuelPrice,
    label,
  }
}

function toGeoJson(
  points: MappedStationRow[],
  primaryFuel: FuelType,
  allPrices: number[],
  markerMode: 'price' | 'rank',
): StationFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((row) => {
      const details = markerDetails(row, primaryFuel, allPrices, markerMode)
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
        properties: {
          color: details.color,
          dimmed: details.dimmed,
          label: details.label,
          permitNumber: row.station.permitNumber,
        },
      }
    }),
  }
}

function createUserMarker(): HTMLDivElement {
  const marker = document.createElement('div')
  marker.className = 'litrito-user-marker'
  marker.setAttribute('aria-label', 'Tu ubicación')
  marker.setAttribute('role', 'img')
  marker.innerHTML =
    '<div class="litrito-user-marker__pulse"></div><div class="litrito-user-marker__dot"></div>'
  return marker
}

function StationPopup({ row, fuelTypes }: { row: MappedStationRow; fuelTypes: FuelType[] }) {
  const station = row.station
  const detailHref = `/estacion/${encodeURIComponent(station.permitNumber)}`
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${row.latitude},${row.longitude}`
  const visibleFuels = fuelTypes.filter((fuelType) => row.prices[fuelType]?.price != null)

  return (
    <div className="litrito-popup">
      <a className="litrito-popup__title" href={detailHref}>
        {station.name}
      </a>
      <div className="litrito-popup__addr">{station.address}</div>
      {(station.municipalityName || station.stateName) && (
        <div className="litrito-popup__loc">
          {[station.municipalityName, station.stateName].filter(Boolean).join(', ')}
        </div>
      )}
      {visibleFuels.length > 0 ? (
        <div className="litrito-popup__prices">
          {visibleFuels.map((fuelType) => (
            <div key={fuelType} className="litrito-popup__price">
              <span className="litrito-popup__fuel">{FUEL_LABEL[fuelType]}</span>
              <span className="litrito-popup__amount">
                <AnimatedPrice value={row.prices[fuelType]!.price} />
                {row.prices[fuelType]!.isPlausible === false ? ' ⚠' : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="litrito-popup__price litrito-popup__price--missing">
          <span className="litrito-popup__amount">Sin precios</span>
        </div>
      )}
      <div className="litrito-popup__actions">
        <a className="litrito-popup__cta litrito-popup__cta--ghost" href={detailHref}>
          Ver detalle
        </a>
        <a
          className="litrito-popup__cta"
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          Cómo llegar
        </a>
      </div>
    </div>
  )
}

function dropMapBreadcrumb(map: MapLibreMap, points: number, kind: 'zoom' | 'move') {
  try {
    const center = map.getCenter()
    const bounds = map.getBounds()
    const round = (number: number) => Math.round(number * 1e4) / 1e4
    Sentry.addBreadcrumb({
      category: 'map',
      level: 'info',
      message: `map ${kind}`,
      data: {
        zoom: map.getZoom(),
        lat: round(center.lat),
        lng: round(center.lng),
        points,
        bounds: [
          round(bounds.getSouth()),
          round(bounds.getWest()),
          round(bounds.getNorth()),
          round(bounds.getEast()),
        ],
      },
    })
  } catch {
    // Never let instrumentation break the map.
  }
}

function featurePermitNumber(feature: MapGeoJSONFeature | undefined): string | null {
  const permitNumber = feature?.properties?.permitNumber
  return typeof permitNumber === 'string' ? permitNumber : null
}

function StationMapInner({
  rows,
  primaryFuel,
  fuelTypes,
  userLocation,
  truncated,
  autoCenterOnUserLocation,
  focus,
  initialBounds,
  loading = false,
  markerMode = 'price',
  onMoveEnd,
  onLocateClick,
}: Props) {
  const [mapReady, setMapReady] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const mapLoadedRef = useRef(false)
  const userMarkerRef = useRef<Marker | null>(null)
  const popupRef = useRef<{ popup: Popup; root: Root } | null>(null)
  const initialBoundsFittedRef = useRef(false)
  const lastFocusKeyRef = useRef<string | null>(null)
  const initialMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointsCountRef = useRef(0)
  const onMoveEndRef = useRef(onMoveEnd)
  const pointsByPermitRef = useRef(new Map<string, MappedStationRow>())
  const fuelTypesRef = useRef(fuelTypes)

  const points = useMemo<MappedStationRow[]>(
    () =>
      rows
        .filter(
          (row) =>
            typeof row.station.latitude === 'number' &&
            typeof row.station.longitude === 'number',
        )
        .map((row) => ({
          ...row,
          latitude: row.station.latitude as number,
          longitude: row.station.longitude as number,
        })),
    [rows],
  )

  const allPrices = useMemo(
    () =>
      points
        .map((point) => point.prices[primaryFuel])
        .filter((price) => price?.isPlausible !== false)
        .map((price) => price?.price)
        .filter((price): price is number => typeof price === 'number'),
    [points, primaryFuel],
  )

  const geoJson = useMemo(
    () => toGeoJson(points, primaryFuel, allPrices, markerMode),
    [allPrices, markerMode, points, primaryFuel],
  )
  const geoJsonRef = useRef(geoJson)

  const userLngLat = useMemo<[number, number] | null>(
    () => (userLocation ? [userLocation.longitude, userLocation.latitude] : null),
    [userLocation],
  )

  const effectiveFocus = useMemo<MapFocus | null>(
    () =>
      focus ??
      (autoCenterOnUserLocation && userLocation
        ? {
            key: `user:${userLocation.latitude.toFixed(3)},${userLocation.longitude.toFixed(3)}`,
            type: 'point',
            lat: userLocation.latitude,
            lon: userLocation.longitude,
          }
        : null),
    [autoCenterOnUserLocation, focus, userLocation],
  )

  useEffect(() => {
    pointsCountRef.current = points.length
    onMoveEndRef.current = onMoveEnd
    fuelTypesRef.current = fuelTypes
    pointsByPermitRef.current = new Map(
      points.map((point) => [point.station.permitNumber, point]),
    )
  }, [fuelTypes, onMoveEnd, points])

  const closePopup = useCallback(() => {
    const activePopup = popupRef.current
    if (!activePopup) return
    popupRef.current = null
    activePopup.popup.remove()
    activePopup.root.unmount()
  }, [])

  const openStationPopup = useCallback(
    (map: MapLibreMap, feature: MapGeoJSONFeature | undefined) => {
      const permitNumber = featurePermitNumber(feature)
      const row = permitNumber ? pointsByPermitRef.current.get(permitNumber) : undefined
      if (!row) return

      closePopup()
      const content = document.createElement('div')
      const root = createRoot(content)
      root.render(<StationPopup row={row} fuelTypes={fuelTypesRef.current} />)
      const popup = new Popup({ closeButton: true, maxWidth: '320px', offset: 22 })
        .setLngLat([row.longitude, row.latitude])
        .setDOMContent(content)
        .addTo(map)
      popupRef.current = { popup, root }
      popup.once('close', () => {
        if (popupRef.current?.popup !== popup) return
        popupRef.current = null
        root.unmount()
      })
    },
    [closePopup],
  )

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      center: MEXICO_CENTER,
      container: containerRef.current,
      maxBounds: MEXICO_BOUNDS,
      maxZoom: 18,
      minZoom: 4,
      pitchWithRotate: false,
      style: MAP_STYLE_URL,
      zoom: 5,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    const handleLoad = () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geoJsonRef.current,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      })
      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#25282b',
          'circle-radius': ['step', ['get', 'point_count'], 20, 25, 24, 100, 29],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: STATION_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['get', 'dimmed'], 0.58, 1],
          'circle-radius': 21,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: STATION_LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-allow-overlap': true,
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0, 0, 0, 0.15)',
          'text-halo-width': 0.5,
        },
      })
      mapLoadedRef.current = true
      setMapReady(true)
    }

    const handleClusterClick = async (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [CLUSTER_LAYER_ID] })[0]
      const clusterId = feature?.properties?.cluster_id
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
      if (typeof clusterId !== 'number' || !source) return
      const zoom = await source.getClusterExpansionZoom(clusterId)
      const coordinates = feature.geometry.type === 'Point' ? feature.geometry.coordinates : null
      if (!coordinates) return
      map.easeTo({ center: [coordinates[0], coordinates[1]], zoom })
    }

    const handleStationClick = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [STATION_LAYER_ID] })[0]
      openStationPopup(map, feature)
    }

    const showPointer = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const hidePointer = () => {
      map.getCanvas().style.cursor = ''
    }
    const handleMoveEnd = () => {
      dropMapBreadcrumb(map, pointsCountRef.current, 'move')
      if (initialMoveTimerRef.current) {
        clearTimeout(initialMoveTimerRef.current)
        initialMoveTimerRef.current = null
      }
      if (!onMoveEndRef.current) return
      if (moveDebounceRef.current) clearTimeout(moveDebounceRef.current)
      moveDebounceRef.current = setTimeout(() => {
        const bounds = map.getBounds()
        onMoveEndRef.current?.({
          swLat: bounds.getSouth(),
          swLon: bounds.getWest(),
          neLat: bounds.getNorth(),
          neLon: bounds.getEast(),
        })
      }, 250)
    }
    const handleZoomEnd = () => dropMapBreadcrumb(map, pointsCountRef.current, 'zoom')

    map.on('load', handleLoad)
    map.on('click', CLUSTER_LAYER_ID, handleClusterClick)
    map.on('click', STATION_LAYER_ID, handleStationClick)
    map.on('mouseenter', [CLUSTER_LAYER_ID, STATION_LAYER_ID], showPointer)
    map.on('mouseleave', [CLUSTER_LAYER_ID, STATION_LAYER_ID], hidePointer)
    map.on('moveend', handleMoveEnd)
    map.on('zoomend', handleZoomEnd)

    if (onMoveEndRef.current) {
      initialMoveTimerRef.current = setTimeout(() => {
        initialMoveTimerRef.current = null
        const bounds = map.getBounds()
        onMoveEndRef.current?.({
          swLat: bounds.getSouth(),
          swLon: bounds.getWest(),
          neLat: bounds.getNorth(),
          neLon: bounds.getEast(),
        })
      }, 700)
    }

    return () => {
      if (initialMoveTimerRef.current) clearTimeout(initialMoveTimerRef.current)
      if (moveDebounceRef.current) clearTimeout(moveDebounceRef.current)
      closePopup()
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
    // The map instance owns its event lifecycle. Dynamic values flow through refs and effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    geoJsonRef.current = geoJson
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(geoJson)
    closePopup()
  }, [closePopup, geoJson])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    if (!userLngLat) return
    userMarkerRef.current = new Marker({ element: createUserMarker() })
      .setLngLat(userLngLat)
      .addTo(map)
  }, [userLngLat])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (effectiveFocus && lastFocusKeyRef.current !== effectiveFocus.key) {
      const isInitialFocus = lastFocusKeyRef.current === null
      lastFocusKeyRef.current = effectiveFocus.key
      if (effectiveFocus.type === 'point') {
        map.flyTo({
          center: [effectiveFocus.lon, effectiveFocus.lat],
          duration: 700,
          zoom: Math.max(map.getZoom(), 14),
        })
        return
      }

      const target: LngLatBoundsLike = [
        [effectiveFocus.bounds.swLon, effectiveFocus.bounds.swLat],
        [effectiveFocus.bounds.neLon, effectiveFocus.bounds.neLat],
      ]
      const currentBounds = map.getBounds()
      const targetIsVisible =
        currentBounds.contains([effectiveFocus.bounds.swLon, effectiveFocus.bounds.swLat]) &&
        currentBounds.contains([effectiveFocus.bounds.neLon, effectiveFocus.bounds.neLat])
      if (
        !isInitialFocus &&
        !effectiveFocus.force &&
        targetIsVisible
      )
        return
      map.fitBounds(target, { maxZoom: 13, padding: 24 })
      return
    }

    if (initialBounds && !initialBoundsFittedRef.current) {
      initialBoundsFittedRef.current = true
      map.fitBounds(
        [
          [initialBounds.swLon, initialBounds.swLat],
          [initialBounds.neLon, initialBounds.neLat],
        ],
        { maxZoom: 13, padding: 24 },
      )
    }
  }, [effectiveFocus, initialBounds, mapReady])

  const locateUser = () => {
    if (userLngLat) {
      mapRef.current?.flyTo({ center: userLngLat, duration: 700, zoom: 14 })
    }
    onLocateClick?.()
  }

  return (
    <div className="relative">
      <div className="litrito-map-shell relative h-[55vh] min-h-[320px] max-h-[640px] overflow-hidden rounded-md border border-slate-200">
        <div aria-label="Mapa de estaciones" className="h-full w-full" ref={containerRef} />
        {(userLngLat || onLocateClick) && (
          <button
            aria-label="Centrar en mi ubicación"
            className="litrito-map-control__btn absolute right-3 top-[92px] z-10"
            onClick={locateUser}
            title="Centrar en mi ubicación"
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
              viewBox="0 0 24 24"
              width="18"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
        )}
        {allPrices.length > 0 && (
          <div className="litrito-legend absolute bottom-6 left-0 z-10">
            <div className="litrito-legend__title">{FUEL_LABEL[primaryFuel]}</div>
            <div className="litrito-legend__row">
              <span className="litrito-legend__chip bg-[#15803d]" />
              <span>Más barato</span>
            </div>
            <div className="litrito-legend__row">
              <span className="litrito-legend__chip bg-[#ca8a04]" />
              <span>Promedio</span>
            </div>
            <div className="litrito-legend__row">
              <span className="litrito-legend__chip bg-[#b91c1c]" />
              <span>Más caro</span>
            </div>
          </div>
        )}
      </div>
      {truncated && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-1 text-xs font-bold text-amber-800 shadow">
          Mostrando {points.length} · acércate para ver más
        </div>
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
            Actualizando mapa
          </div>
        </div>
      )}
      {!loading && points.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-bold text-slate-500 shadow">
          No hay estaciones en esta zona
        </div>
      )}
    </div>
  )
}

export function StationMap(props: Props) {
  return (
    <ComponentErrorBoundary
      name="station-map"
      context={{
        points: props.rows.length,
        primaryFuel: props.primaryFuel,
        markerMode: props.markerMode ?? 'price',
        truncated: props.truncated ?? false,
      }}
      fallback={<MapErrorFallback />}
    >
      <StationMapInner {...props} />
    </ComponentErrorBoundary>
  )
}

function MapErrorFallback() {
  return (
    <div className="flex h-[55vh] min-h-[320px] max-h-[640px] flex-col items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-6 text-center">
      <p className="text-sm font-bold text-ink">No pudimos cargar el mapa</p>
      <p className="max-w-xs text-xs text-body">
        Puedes seguir usando el listado mientras tanto. Recarga para reintentar.
      </p>
    </div>
  )
}

export default StationMap
