'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MaplibreMap, Marker, Popup } from 'maplibre-gl'
import type { Area, Camera, Locale, Pin, Station, TripRoute } from '@/lib/content/types'
import { cardElement } from './pin-card'
import { loadMaplibreGl } from '@/lib/map/load-maplibre'
import { addAreaHover } from '@/lib/map/area-hover'
import { addBuilding3DLayer } from '@/lib/map/buildings'
import { isGestureActive } from '@/lib/map/gesture'
import { fitPopupSoon, overlayInsets } from '@/lib/map/fit-popup'
import { t } from '@/lib/i18n/locales'
import { PAPER_STYLE_URL } from './explorer-map'
import { STOP_COLORS } from './trip-map'
import { declutterLabels, watchDeclutter } from '@/lib/map/declutter'

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
  /** The area in view on the home page: all of its highlights are pinned at once. */
  focus?: { pins: Pin[]; area: Area; /** Number the pins 1, 2, 3 in list order instead of naming them: for a plan whose list carries the names. */ numbered?: boolean } | null
  /** One fixed, named point such as a station: a labelled marker in the line's colour, on top of the numbered pins. */
  marker?: { lon: number; lat: number; label: string; color: string } | null
  /** A highlight the reader tapped: its card opens on the map. */
  card?: { pin: Pin; area: Area } | null
  onCloseCard?: () => void
  /** For the card's walk line and outbound links. */
  cityId?: string
  stations?: Station[]
  /** An area clicked (or tapped) on the map. */
  onSelectArea?: (areaId: string) => void
}

/** A numbered badge in the area's colour, for a plan's stops. */
function numberElement(n: number, color: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tm-pin tm-pin--num'
  el.style.setProperty('--pin', color)
  el.textContent = String(n)
  return el
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
export function StageMap({ locale, camera, threeD, areas, route, routes = [], focus = null, marker = null, card = null, onCloseCard, cityId = '', stations = [], onSelectArea }: StageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onSelectAreaRef = useRef(onSelectArea)
  useEffect(() => {
    onSelectAreaRef.current = onSelectArea
  }, [onSelectArea])
  const mapRef = useRef<MaplibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const popupRef = useRef<Popup | null>(null)
  const closeRef = useRef(onCloseCard)
  useEffect(() => {
    closeRef.current = onCloseCard
  }, [onCloseCard])
  const stationById = useMemo(() => new Map(stations.map((st) => [st.id, st])), [stations])
  const [mapReady, setMapReady] = useState(0)

  useEffect(() => {
    let cancelled = false
    let map: MaplibreMap | null = null
    let ro: ResizeObserver | null = null
    let hover: { remove: () => void } | null = null
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
        hover = addAreaHover(map, areas, locale, (id) => onSelectAreaRef.current?.(id), `${ROUTE_SOURCE}-casing`, maplibregl.Marker)
        mapRef.current = map
        watchDeclutter(map, () => markersRef.current)
        // Narrow stage: the trip stops show their numbers only (the list under the map carries the names).
        const numsOnly = () => map!.getContainer().classList.toggle('tm-map--nums', map!.getContainer().clientWidth < 768)
        numsOnly()
        map.on('resize', numsOnly)
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
      hover?.remove()
      popupRef.current?.remove()
      popupRef.current = null
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
        declutterLabels(markersRef.current, map.getContainer())
        return
      }
      for (const a of areas) {
        // The area whose highlights are pinned drops its own label: the pins say where it is.
        if (focus?.pins.length && a.id === focus.area.id) continue
        const el = labelElement(t(a.name, locale), `var(--${a.color})`, !!focus && a.id !== focus.area.id)
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat(a.camera.center).addTo(map))
      }
      ;(focus?.pins ?? []).forEach((pin, i) => {
        const el = focus!.numbered ? numberElement(i + 1, `var(--${focus!.area.color})`) : labelElement(t(pin.name, locale), `var(--${focus!.area.color})`, false)
        el.classList.add('tm-pin--active')
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: focus!.numbered ? 'center' : 'left' }).setLngLat([pin.location.lon, pin.location.lat]).addTo(map))
      })
      if (marker) {
        const el = labelElement(marker.label, marker.color, false)
        el.classList.add('tm-pin--station')
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([marker.lon, marker.lat]).addTo(map))
      }
      declutterLabels(markersRef.current, map.getContainer())
    })()
    return () => {
      cancelled = true
    }
  }, [areas, route, focus, marker, locale, mapReady])

  // The card of a tapped highlight.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const previous = popupRef.current
    popupRef.current = null
    previous?.remove()
    if (!card) return
    let cancelled = false
    let stopFit: (() => void) | null = null
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled) return
      const { pin, area } = card
      const station = pin.walk ? stationById.get(pin.walk.station) : undefined
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '300px', className: 'tm-card-popup' })
        .setLngLat([pin.location.lon, pin.location.lat])
        .setDOMContent(cardElement(locale, cityId, pin, area, station, [], () => closeRef.current?.(), () => {}))
        .addTo(map)
      popupRef.current = popup
      // Zoom in on the place, then measure the card and pan by what sticks out of the map.
      if (!isGestureActive(map) && map.getZoom() < 14.5) map.easeTo({ center: [pin.location.lon, pin.location.lat], zoom: 14.5, duration: 700, essential: true })
      stopFit = fitPopupSoon(map, popup, () => overlayInsets(map))
    })()
    return () => {
      cancelled = true
      stopFit?.()
    }
  }, [card, stationById, locale, cityId, mapReady])

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
    if (focus?.pins.length) {
      // Frame every pinned highlight (and the area's centre) so no label is cut off at the edge.
      const pts: [number, number][] = [camera.center, ...focus.pins.map((p): [number, number] => [p.location.lon, p.location.lat])]
      if (marker) pts.push([marker.lon, marker.lat])
      const lons = pts.map((c) => c[0]), lats = pts.map((c) => c[1])
      // The labels hang to the right of their dots, so the right padding is the widest label; a phone's narrow band gets tighter margins.
      const narrow = map.getContainer().clientWidth < 600
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], {
        padding: narrow ? { top: 36, bottom: 72, left: 20, right: 120 } : { top: 80, bottom: 80, left: 80, right: 160 }, maxZoom: camera.zoom, pitch: threeD ? camera.pitch : 0, bearing: threeD ? camera.bearing : 0, duration: 1600, essential: true,
      })
      return
    }
    map.flyTo({ center: camera.center, zoom: camera.zoom, pitch: threeD ? camera.pitch : 0, bearing: threeD ? camera.bearing : 0, duration: 1600, essential: true })
  }, [camera, route, routes, threeD, focus, marker, mapReady])

  return <div ref={containerRef} className="h-full w-full bg-paper" />
}
