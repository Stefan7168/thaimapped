'use client'

import { useEffect, useRef, useState } from 'react'
import type { LngLatBoundsLike, Map as MaplibreMap, Marker } from 'maplibre-gl'
import type { Area, Camera, Locale, Pin, Station } from '@/lib/content/types'
import { loadMaplibreGl } from '@/lib/map/load-maplibre'
import { addBuilding3DLayer } from '@/lib/map/buildings'
import { isGestureActive } from '@/lib/map/gesture'
import { t } from '@/lib/i18n/locales'
import { WALK_RADIUS_M, type VisiblePin } from '@/lib/explorer/filters'

export const PAPER_STYLE_URL = '/map/paper.json'
const WALK_CIRCLE_SOURCE = 'tm-walk-circle'

export interface ExplorerMapProps {
  locale: Locale
  cityCamera: Camera
  threeD: boolean
  areas: Area[]
  /** Pins that pass the filters. Empty means the city overview with area labels. */
  pins: VisiblePin[]
  /** Stations that draw a walking circle. */
  stations: Station[]
  /** Centres of picked areas and sub-areas, framed even when no pin matches. */
  centres: [number, number][]
  /** Pin to highlight, if any. */
  activePinId: string | null
  onSelectArea: (id: string) => void
  onSelectPin: (pin: Pin) => void
}

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

function pinElement(label: string, color: string, minor: boolean, active: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = `tm-pin${minor ? ' tm-pin--minor' : ''}${active ? ' tm-pin--active' : ''}`
  el.style.setProperty('--pin', color)
  const dot = document.createElement('span')
  dot.className = 'tm-pin__dot'
  const text = document.createElement('span')
  text.className = 'tm-pin__label'
  text.textContent = label
  el.append(dot, text)
  return el
}

/** Bounds around every pin and station circle, or null when there is nothing to frame. */
function focusBounds(pins: VisiblePin[], stations: Station[], centres: [number, number][]): LngLatBoundsLike | null {
  const pts: [number, number][] = [...centres]
  for (const { pin } of pins) pts.push([pin.location.lon, pin.location.lat])
  for (const st of stations) {
    const dLat = WALK_RADIUS_M / 111_320
    const dLon = WALK_RADIUS_M / (111_320 * Math.cos((st.lat * Math.PI) / 180))
    pts.push([st.lon - dLon, st.lat - dLat], [st.lon + dLon, st.lat + dLat])
  }
  if (pts.length === 0) return null
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [lon, lat] of pts) {
    w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat)
  }
  // A single point still needs a frame: pad to roughly 400 m each way.
  const pad = 0.004
  return [[w - pad, s - pad], [e + pad, n + pad]]
}

export function ExplorerMap(props: ExplorerMapProps) {
  const { locale, cityCamera, threeD, areas, pins, stations, centres, activePinId, onSelectArea, onSelectPin } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const callbacks = useRef({ onSelectArea, onSelectPin })
  useEffect(() => {
    callbacks.current = { onSelectArea, onSelectPin }
  }, [onSelectArea, onSelectPin])
  // Bumped once the style has loaded so the effects below re-run (refs do not re-render).
  const [mapReady, setMapReady] = useState(0)

  useEffect(() => {
    let cancelled = false
    let map: MaplibreMap | null = null
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled || !containerRef.current) return
      map = new maplibregl.Map({
        container: containerRef.current,
        style: PAPER_STYLE_URL,
        center: cityCamera.center,
        zoom: cityCamera.zoom,
        pitch: threeD ? cityCamera.pitch : 0,
        bearing: threeD ? cityCamera.bearing : 0,
        maxPitch: threeD ? 65 : 0,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      })
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: threeD }), 'top-right')
      // 'style.load' not 'load': the latter also waits for the tile source, so a
      // slow or failed tile server would hide our own pins and circles too.
      map.once('style.load', () => {
        if (!map) return
        if (threeD) addBuilding3DLayer(map)
        map.addSource(WALK_CIRCLE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: `${WALK_CIRCLE_SOURCE}-fill`, type: 'fill', source: WALK_CIRCLE_SOURCE, paint: { 'fill-color': '#c8553d', 'fill-opacity': 0.1 } })
        map.addLayer({ id: `${WALK_CIRCLE_SOURCE}-line`, type: 'line', source: WALK_CIRCLE_SOURCE, paint: { 'line-color': '#c8553d', 'line-width': 1.5, 'line-dasharray': [2, 2] } })
        mapRef.current = map
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
    // Created once; the effects below handle later prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Markers: area labels on the overview, filtered pins otherwise.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let cancelled = false
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled) return
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      if (pins.length === 0 && stations.length === 0 && centres.length === 0) {
        for (const a of areas) {
          const el = pinElement(t(a.name, locale), `var(--${a.color})`, false, false)
          el.addEventListener('click', () => callbacks.current.onSelectArea(a.id))
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat(a.camera.center).addTo(map))
        }
        return
      }
      for (const { pin, area } of pins) {
        const el = pinElement(t(pin.name, locale), `var(--${area.color})`, pin.kind !== 'hotel', pin.id === activePinId)
        el.addEventListener('click', () => callbacks.current.onSelectPin(pin))
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([pin.location.lon, pin.location.lat]).addTo(map))
      }
      for (const st of stations) {
        const el = pinElement(st.code ? `${st.code} ${t(st.name, locale)}` : t(st.name, locale), '#c8553d', true, false)
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([st.lon, st.lat]).addTo(map))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [areas, pins, stations, centres, activePinId, locale, mapReady])

  // Camera: frame the pins and circles, or return to the city view.
  useEffect(() => {
    const map = mapRef.current
    if (!map || isGestureActive(map)) return
    const bounds = focusBounds(pins, stations, centres)
    if (!bounds) {
      map.flyTo({ center: cityCamera.center, zoom: cityCamera.zoom, pitch: threeD ? cityCamera.pitch : 0, bearing: threeD ? cityCamera.bearing : 0, duration: 1400, essential: true })
      return
    }
    map.fitBounds(bounds, { padding: 60, maxZoom: 15.5, pitch: threeD ? 50 : 0, bearing: threeD ? -12 : 0, duration: 1400, essential: true })
  }, [pins, stations, centres, threeD, cityCamera, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(WALK_CIRCLE_SOURCE) as { setData?: (d: GeoJSON.GeoJSON) => void } | undefined
    src?.setData?.({ type: 'FeatureCollection', features: stations.map((st) => circlePolygon(st.lon, st.lat, WALK_RADIUS_M)) })
  }, [stations, mapReady])

  return <div ref={containerRef} className="h-full w-full bg-paper" aria-label="Map" role="region" />
}
