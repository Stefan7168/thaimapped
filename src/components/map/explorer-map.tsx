'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as MaplibreMap, Marker } from 'maplibre-gl'
import type { Area, Camera, Locale, Pin, Station } from '@/lib/content/types'
import { loadMaplibreGl } from '@/lib/map/load-maplibre'
import { addBuilding3DLayer } from '@/lib/map/buildings'
import { isGestureActive } from '@/lib/map/gesture'
import { t } from '@/lib/i18n/locales'

export const PAPER_STYLE_URL = '/map/paper.json'
const WALK_CIRCLE_SOURCE = 'tm-walk-circle'
const WALK_RADIUS_M = 800

export interface ExplorerMapProps {
  locale: Locale
  initialCamera: Camera
  threeD: boolean
  areas: Area[]
  /** Selected area id, or null for the whole-city view. */
  selectedArea: string | null
  /** Selected station for the walking circle, or null. */
  selectedStation: Station | null
  onSelectArea: (id: string) => void
  onSelectPin: (pin: Pin) => void
}

/** A GeoJSON polygon approximating a circle of `radiusM` metres around a point. */
function circlePolygon(lon: number, lat: number, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  const dLat = radiusM / 111_320
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    coords.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }
}

function pinElement(label: string, color: string, minor: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = `tm-pin${minor ? ' tm-pin--minor' : ''}`
  el.style.setProperty('--pin', color)
  const dot = document.createElement('span')
  dot.className = 'tm-pin__dot'
  const text = document.createElement('span')
  text.className = 'tm-pin__label'
  text.textContent = label
  el.append(dot, text)
  return el
}

export function ExplorerMap(props: ExplorerMapProps) {
  const { locale, initialCamera, threeD, areas, selectedArea, selectedStation, onSelectArea, onSelectPin } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const callbacks = useRef({ onSelectArea, onSelectPin })
  useEffect(() => {
    callbacks.current = { onSelectArea, onSelectPin }
  }, [onSelectArea, onSelectPin])
  // Bumped once the style has loaded so the effects below re-run (refs do not re-render).
  const [mapReady, setMapReady] = useState(0)

  // Create the map once.
  useEffect(() => {
    let cancelled = false
    let map: MaplibreMap | null = null
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled || !containerRef.current) return
      map = new maplibregl.Map({
        container: containerRef.current,
        style: PAPER_STYLE_URL,
        center: initialCamera.center,
        zoom: initialCamera.zoom,
        pitch: threeD ? initialCamera.pitch : 0,
        bearing: threeD ? initialCamera.bearing : 0,
        maxPitch: threeD ? 65 : 0,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      })
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: threeD }), 'top-right')
      // 'style.load' not 'load': the latter also waits for the tile source, so a
      // slow or failed tile server would hide our own pins and circle too.
      map.once('style.load', () => {
        if (!map) return
        if (threeD) addBuilding3DLayer(map)
        map.addSource(WALK_CIRCLE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: `${WALK_CIRCLE_SOURCE}-fill`,
          type: 'fill',
          source: WALK_CIRCLE_SOURCE,
          paint: { 'fill-color': '#c8553d', 'fill-opacity': 0.12 },
        })
        map.addLayer({
          id: `${WALK_CIRCLE_SOURCE}-line`,
          type: 'line',
          source: WALK_CIRCLE_SOURCE,
          paint: { 'line-color': '#c8553d', 'line-width': 1.5, 'line-dasharray': [2, 2] },
        })
        mapRef.current = map
        // Trigger the marker effect now that the map exists.
        setMapReady((n) => n + 1)
      })
    })()
    return () => {
      cancelled = true
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      mapRef.current = null
      map?.remove()
    }
    // The map is created once; later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Markers: area labels on the city view, pins when an area is selected.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let cancelled = false
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled) return
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      const area = areas.find((a) => a.id === selectedArea) ?? null
      if (!area) {
        for (const a of areas) {
          const el = pinElement(t(a.name, locale), `var(--${a.color})`, false)
          el.addEventListener('click', () => callbacks.current.onSelectArea(a.id))
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat(a.camera.center).addTo(map))
        }
      } else {
        for (const pin of area.pins) {
          const el = pinElement(t(pin.name, locale), `var(--${area.color})`, pin.kind !== 'hotel')
          el.addEventListener('click', () => callbacks.current.onSelectPin(pin))
          markersRef.current.push(
            new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([pin.location.lon, pin.location.lat]).addTo(map),
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [areas, selectedArea, locale, mapReady])

  // Camera: fly to the selected area, the selected station, or back to the city.
  useEffect(() => {
    const map = mapRef.current
    if (!map || isGestureActive(map)) return
    const area = areas.find((a) => a.id === selectedArea) ?? null
    const target: Camera = selectedStation
      ? { center: [selectedStation.lon, selectedStation.lat], zoom: 15.2, pitch: 52, bearing: -12 }
      : (area?.camera ?? initialCamera)
    map.flyTo({
      center: target.center,
      zoom: target.zoom,
      pitch: threeD ? target.pitch : 0,
      bearing: threeD ? target.bearing : 0,
      duration: 1600,
      essential: true,
    })
  }, [areas, selectedArea, selectedStation, threeD, initialCamera, mapReady])

  // Walking circle around the selected station.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(WALK_CIRCLE_SOURCE) as { setData?: (d: GeoJSON.GeoJSON) => void } | undefined
    if (!src?.setData) return
    src.setData({
      type: 'FeatureCollection',
      features: selectedStation ? [circlePolygon(selectedStation.lon, selectedStation.lat, WALK_RADIUS_M)] : [],
    })
  }, [selectedStation, mapReady])

  return <div ref={containerRef} className="h-full w-full bg-paper" aria-label="Map" role="region" />
}
