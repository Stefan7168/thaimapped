'use client'

import { useEffect, useRef, useState } from 'react'
import type { LngLatBoundsLike, Map as MaplibreMap, Marker } from 'maplibre-gl'
import type { Locale, TripRoute } from '@/lib/content/types'
import { loadMaplibreGl } from '@/lib/map/load-maplibre'
import { isGestureActive } from '@/lib/map/gesture'
import { declutterLabels, watchDeclutter } from '@/lib/map/declutter'
import { t } from '@/lib/i18n/locales'
import { PAPER_STYLE_URL } from './explorer-map'

const ROUTE_SOURCE = 'tm-route'

export const STOP_COLORS: Record<string, string> = {
  start: '#2b2a26',
  end: '#2b2a26',
  coffee: '#a6753a',
  food: '#d98e2b',
  sight: '#4f7c8a',
  hotel: '#c8553d',
  viewpoint: '#6c8f5b',
  market: '#8a5fa1',
  fuel: '#6f6a5f',
}

export interface TripMapProps {
  locale: Locale
  route: TripRoute
  /** Day to frame, or null for the whole trip. */
  day: number | null
  activeStopId: string | null
  onSelectStop: (id: string) => void
  /** The stop whose list row the pointer is on: its number is lifted on the map. */
  hoverStopId?: string | null
  /** The pointer entered (id) or left (null) a stop on the map: the page lifts its list row. */
  onHoverStop?: (id: string | null) => void
}

function bounds(points: [number, number][]): LngLatBoundsLike {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [lon, lat] of points) {
    w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat)
  }
  return [[w, s], [e, n]]
}

function stopElement(index: number, label: string, color: string, active: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = `tm-stop${active ? ' tm-stop--active' : ''}`
  el.style.setProperty('--pin', color)
  const num = document.createElement('span')
  num.className = 'tm-stop__num'
  num.textContent = String(index)
  const text = document.createElement('span')
  text.className = 'tm-stop__label'
  text.textContent = label
  el.append(num, text)
  return el
}

/** The trip page map: the road line plus numbered stops. 2D on purpose, a route reads best flat. */
export function TripMap({ locale, route, day, activeStopId, onSelectStop, hoverStopId = null, onHoverStop }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const framedOnce = useRef(false)
  const markersRef = useRef<Marker[]>([])
  const onSelect = useRef(onSelectStop)
  useEffect(() => {
    onSelect.current = onSelectStop
  }, [onSelectStop])
  const [mapReady, setMapReady] = useState(0)
  const onHover = useRef(onHoverStop)
  useEffect(() => {
    onHover.current = onHoverStop
  }, [onHoverStop])
  const hoverRef = useRef(hoverStopId)
  const stopElsRef = useRef(new Map<string, HTMLElement>())
  // The hovered row's stop is lifted in place, without rebuilding the markers.
  useEffect(() => {
    hoverRef.current = hoverStopId
    for (const [id, el] of stopElsRef.current) el.classList.toggle('tm-stop--hover', id === hoverStopId)
  }, [hoverStopId, mapReady])

  useEffect(() => {
    let cancelled = false
    let map: MaplibreMap | null = null
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled || !containerRef.current) return
      map = new maplibregl.Map({
        container: containerRef.current,
        style: PAPER_STYLE_URL,
        center: route.camera.center,
        zoom: route.camera.zoom,
        pitch: 0,
        maxPitch: 0,
        attributionControl: { compact: true },
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.once('style.load', () => {
        if (!map) return
        const line = route.path ?? route.waypoints
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } } })
        map.addLayer({ id: `${ROUTE_SOURCE}-casing`, type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } })
        map.addLayer({
          id: `${ROUTE_SOURCE}-line`,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#c8553d', 'line-width': 4, ...(route.path ? {} : { 'line-dasharray': [2, 1.5] }) },
        })
        mapRef.current = map
        watchDeclutter(map, () => markersRef.current)
        // Narrow stage: the stops show their numbers only (the list under the map carries the names).
        const numsOnly = () => map!.getContainer().classList.toggle('tm-map--nums', map!.getContainer().clientWidth < 768)
        numsOnly()
        map.on('resize', numsOnly)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let cancelled = false
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled) return
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      stopElsRef.current.clear()
      route.stops.forEach((stop, i) => {
        const dimmed = day !== null && stop.day !== day
        const el = stopElement(i + 1, t(stop.name, locale), STOP_COLORS[stop.kind] ?? '#6f6a5f', stop.id === activeStopId)
        if (dimmed) el.classList.add('tm-stop--dim')
        el.addEventListener('click', () => onSelect.current(stop.id))
        el.addEventListener('mouseenter', () => onHover.current?.(stop.id))
        el.addEventListener('mouseleave', () => onHover.current?.(null))
        if (stop.id === hoverRef.current) el.classList.add('tm-stop--hover')
        stopElsRef.current.set(stop.id, el)
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([stop.location.lon, stop.location.lat]).addTo(map))
      })
      declutterLabels(markersRef.current, map.getContainer())
    })()
    return () => {
      cancelled = true
    }
  }, [route, day, activeStopId, locale, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || isGestureActive(map)) return
    const active = route.stops.find((s) => s.id === activeStopId)
    if (active) {
      map.flyTo({ center: [active.location.lon, active.location.lat], zoom: Math.max(map.getZoom(), 13), duration: 1200 })
      return
    }
    const stops = day === null ? route.stops : route.stops.filter((s) => s.day === day)
    const pts: [number, number][] = stops.map((s) => [s.location.lon, s.location.lat])
    if (day === null) pts.push(...(route.path ?? route.waypoints))
    if (pts.length < 2) return
    // The first framing is a cut, so the stops land spread out instead of piling up for a second of flight.
    map.fitBounds(bounds(pts), { padding: 70, duration: framedOnce.current ? 1200 : 0 })
    framedOnce.current = true
  }, [route, day, activeStopId, mapReady])

  // On paper the map box changes shape (print CSS), so the whole route is re-framed into it before the page prints, and framed back after.
  useEffect(() => {
    const frame = () => {
      const map = mapRef.current
      if (!map) return
      map.resize()
      const pts: [number, number][] = [...route.stops.map((s) => [s.location.lon, s.location.lat] as [number, number]), ...(route.path ?? route.waypoints)]
      if (pts.length >= 2) map.fitBounds(bounds(pts), { padding: 40, duration: 0 })
    }
    window.addEventListener('beforeprint', frame)
    window.addEventListener('afterprint', frame)
    return () => {
      window.removeEventListener('beforeprint', frame)
      window.removeEventListener('afterprint', frame)
    }
  }, [route])

  return <div ref={containerRef} className="h-full w-full bg-paper" />
}
