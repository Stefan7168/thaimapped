'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as MaplibreMap, Marker } from 'maplibre-gl'
import type { Area, Camera, Locale, TripRoute } from '@/lib/content/types'
import { loadMaplibreGl } from '@/lib/map/load-maplibre'
import { addBuilding3DLayer } from '@/lib/map/buildings'
import { isGestureActive } from '@/lib/map/gesture'
import { t } from '@/lib/i18n/locales'
import { PAPER_STYLE_URL } from './explorer-map'
import { STOP_COLORS } from './trip-map'

const ROUTE_SOURCE = 'tm-stage-route'

export interface StageMapProps {
  locale: Locale
  /** Where the map looks now. A change flies the map there. */
  camera: Camera
  threeD: boolean
  /** Area labels, shown while no route is drawn. */
  areas: Area[]
  /** A trip to draw as a line with numbered stops, or null for the area labels. */
  route: TripRoute | null
  /** Every trip, drawn as quiet lines while no single one is active. */
  routes?: TripRoute[]
}

function labelElement(text: string, color: string, minor: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = `tm-pin${minor ? ' tm-pin--minor' : ''}`
  el.style.setProperty('--pin', color)
  const dot = document.createElement('span')
  dot.className = 'tm-pin__dot'
  const label = document.createElement('span')
  label.className = 'tm-pin__label'
  label.textContent = text
  el.append(dot, label)
  return el
}

function stopElement(index: number, text: string, color: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tm-stop'
  el.style.setProperty('--pin', color)
  const num = document.createElement('span')
  num.className = 'tm-stop__num'
  num.textContent = String(index)
  const label = document.createElement('span')
  label.className = 'tm-stop__label'
  label.textContent = text
  el.append(num, label)
  return el
}

function routesBounds(routes: TripRoute[]): [[number, number], [number, number]] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const route of routes) {
    for (const [lon, lat] of route.path ?? route.waypoints) {
      w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat)
    }
  }
  return [[w, s], [e, n]]
}

/**
 * The map that stays put while a page scrolls beside it (home, trips index).
 * It only follows the page: the camera prop moves it, a route prop draws a
 * trip on it. Wheel zoom is off so the page keeps scrolling over it.
 */
export function StageMap({ locale, camera, threeD, areas, route, routes = [] }: StageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const [mapReady, setMapReady] = useState(0)

  useEffect(() => {
    let cancelled = false
    let map: MaplibreMap | null = null
    let ro: ResizeObserver | null = null
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled || !containerRef.current) return
      map = new maplibregl.Map({
        container: containerRef.current,
        style: PAPER_STYLE_URL,
        center: camera.center,
        zoom: camera.zoom,
        pitch: threeD ? camera.pitch : 0,
        bearing: threeD ? camera.bearing : 0,
        maxPitch: threeD ? 65 : 0,
        attributionControl: { compact: true },
        scrollZoom: false,
        cooperativeGestures: false,
      })
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: threeD, showCompass: false }), 'top-right')
      map.once('style.load', () => {
        if (!map) return
        if (threeD) addBuilding3DLayer(map)
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: `${ROUTE_SOURCE}-casing`, type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } })
        map.addLayer({ id: `${ROUTE_SOURCE}-line`, type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c8553d', 'line-width': 4, 'line-dasharray': ['case', ['get', 'dashed'], ['literal', [2, 1.5]], ['literal', [1, 0]]] } })
        mapRef.current = map
        setMapReady((n) => n + 1)
      })
      // The panel changes size with the viewport (56svh on phones, full height
      // beside the sheet); the canvas must follow or the view sits off-centre.
      if ('ResizeObserver' in window && containerRef.current) {
        ro = new ResizeObserver(() => map?.resize())
        ro.observe(containerRef.current)
      }
    })()
    return () => {
      cancelled = true
      ro?.disconnect()
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      mapRef.current = null
      map?.remove()
    }
    // Created once; the effects below handle later prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Markers: area labels, or the numbered stops of the route.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let cancelled = false
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled) return
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      if (route) {
        route.stops.forEach((stop, i) => {
          const el = stopElement(i + 1, t(stop.name, locale), STOP_COLORS[stop.kind] ?? '#6f6a5f')
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([stop.location.lon, stop.location.lat]).addTo(map))
        })
        return
      }
      for (const a of areas) {
        const el = labelElement(t(a.name, locale), `var(--${a.color})`, false)
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat(a.camera.center).addTo(map))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [areas, route, locale, mapReady])

  // The route line.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(ROUTE_SOURCE) as { setData?: (d: GeoJSON.GeoJSON) => void } | undefined
    const shown = route ? [route] : routes
    const features: GeoJSON.Feature[] = shown.map((r) => ({ type: 'Feature', properties: { dashed: !r.path }, geometry: { type: 'LineString', coordinates: r.path ?? r.waypoints } }))
    src?.setData?.({ type: 'FeatureCollection', features })
  }, [route, routes, mapReady])

  // Camera: the route's extent when one is drawn, otherwise the camera prop.
  useEffect(() => {
    const map = mapRef.current
    if (!map || isGestureActive(map)) return
    const framed = route ?? (routes.length ? routes : null)
    if (framed) {
      const list = Array.isArray(framed) ? framed : [framed]
      map.fitBounds(routesBounds(list), { padding: 56, maxZoom: 15, pitch: 0, bearing: 0, duration: 1600, essential: true })
      return
    }
    map.flyTo({ center: camera.center, zoom: camera.zoom, pitch: threeD ? camera.pitch : 0, bearing: threeD ? camera.bearing : 0, duration: 1600, essential: true })
  }, [camera, route, routes, threeD, mapReady])

  return <div ref={containerRef} className="h-full w-full bg-paper" aria-label="Map" role="region" />
}
