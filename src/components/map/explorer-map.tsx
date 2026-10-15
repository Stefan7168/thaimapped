'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExpressionSpecification, LngLatBoundsLike, Map as MaplibreMap, Marker, Popup } from 'maplibre-gl'
import type { Area, Camera, Locale, Pin, Station } from '@/lib/content/types'
import { loadMaplibreGl } from '@/lib/map/load-maplibre'
import { addAreaHover, type AreaHover } from '@/lib/map/area-hover'
import { addBuilding3DLayer, BUILDING_3D_LAYER_ID } from '@/lib/map/buildings'
import { isGestureActive } from '@/lib/map/gesture'
import { fitPopupSoon, overlayInsets } from '@/lib/map/fit-popup'
import { t } from '@/lib/i18n/locales'
import { cardElement } from './pin-card'
import { WALK_RADIUS_M, nearbyPins, type VisiblePin } from '@/lib/explorer/filters'

export const PAPER_STYLE_URL = '/map/paper.json'

/** A border to draw: an area or a sub-area, in its area's colour. */
export interface Outline {
  id: string
  color: Area['color']
  boundary: GeoJSON.MultiPolygon
}
const WALK_CIRCLE_SOURCE = 'tm-walk-circle'
const OUTLINE_SOURCE = 'tm-area-outline'
/** Streets and zones of the visible places: a glowing road stretch or a soft area wash. */
const SHAPE_SOURCE = 'tm-place-shape'
const BUILDING_TINT_LAYER = 'tm-building-3d-tint'
const NEARBY_SOURCE = 'tm-nearby'

export interface ExplorerMapProps {
  locale: Locale
  /** For the sub-ID on the card's outbound links. */
  cityId: string
  cityCamera: Camera
  threeD: boolean
  areas: Area[]
  /** Pins that pass the filters. Empty means the city overview with area labels. */
  pins: VisiblePin[]
  /** Every pin of the city, for the "walkable from here" tip on the card. */
  allPins: VisiblePin[]
  /** Every station of the city, for the walk line on a pin's card. */
  allStations: Station[]
  /** Stations that draw a walking circle. */
  stations: Station[]
  /** Centres of picked areas and sub-areas, framed even when no pin matches. */
  centres: [number, number][]
  /** Borders drawn and framed: ticked areas and sub-areas. */
  outlines: Outline[]
  /** Pin to highlight and open a card on, if any. */
  activePinId: string | null
  onSelectArea: (id: string) => void
  onSelectPin: (pin: Pin) => void
  /** The card's close button, or the user tapping the map away from it. */
  onClosePin: () => void
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
function focusBounds(pins: VisiblePin[], stations: Station[], centres: [number, number][], outlines: Outline[]): LngLatBoundsLike | null {
  const pts: [number, number][] = [...centres]
  for (const o of outlines) for (const poly of o.boundary.coordinates) for (const [lon, lat] of poly[0]) pts.push([lon, lat])
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
  // A single point still needs a frame: pad to roughly 400 m each way. A real
  // extent is framed as is, so an outline nearly fills the map.
  const pad = e - w < 0.002 && n - s < 0.002 ? 0.004 : 0
  return [[w - pad, s - pad], [e + pad, n + pad]]
}

export function ExplorerMap(props: ExplorerMapProps) {
  const { locale, cityId, cityCamera, threeD, areas, pins, allPins, allStations, stations, centres, outlines, activePinId, onSelectArea, onSelectPin, onClosePin } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const popupRef = useRef<Popup | null>(null)
  const hoverRef = useRef<AreaHover | null>(null)
  const stationById = useMemo(() => new Map(allStations.map((st) => [st.id, st])), [allStations])
  const callbacks = useRef({ onSelectArea, onSelectPin, onClosePin })
  useEffect(() => {
    callbacks.current = { onSelectArea, onSelectPin, onClosePin }
  }, [onSelectArea, onSelectPin, onClosePin])
  // Bumped once the style has loaded so the effects below re-run (refs do not re-render).
  const [mapReady, setMapReady] = useState(0)

  useEffect(() => {
    let cancelled = false
    let map: MaplibreMap | null = null
    let hover: AreaHover | null = null
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
        // The district border of each ticked area, in the area's own colour.
        map.addSource(SHAPE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        const strength = (quiet: number, loud: number): ExpressionSpecification => ['case', ['get', 'active'], loud, quiet]
        map.addLayer({ id: `${SHAPE_SOURCE}-zone`, type: 'fill', source: SHAPE_SOURCE, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': strength(0.18, 0.3) } })
        map.addLayer({ id: `${SHAPE_SOURCE}-zone-edge`, type: 'line', source: SHAPE_SOURCE, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': strength(0.5, 0.9), 'line-blur': 1 } })
        map.addLayer({ id: `${SHAPE_SOURCE}-glow`, type: 'line', source: SHAPE_SOURCE, filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 26], 'line-blur': ['interpolate', ['linear'], ['zoom'], 13, 6, 16, 14], 'line-opacity': strength(0.35, 0.55) } })
        map.addLayer({ id: `${SHAPE_SOURCE}-core`, type: 'line', source: SHAPE_SOURCE, filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 7], 'line-opacity': strength(0.8, 1) } })
        // Buildings inside a zone take the place's colour; the filter is set when zones change.
        if (threeD && map.getLayer(BUILDING_3D_LAYER_ID)) {
          map.addLayer({ id: BUILDING_TINT_LAYER, type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14, filter: ['boolean', false], paint: { 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-color': '#d9a08f', 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 0.95] } }, `${SHAPE_SOURCE}-zone`)
        }
        map.addSource(OUTLINE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: `${OUTLINE_SOURCE}-fill`, type: 'fill', source: OUTLINE_SOURCE, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.08 } })
        // Dashed threads from the open card to the places within a short walk.
        map.addSource(NEARBY_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: `${NEARBY_SOURCE}-line`, type: 'line', source: NEARBY_SOURCE, paint: { 'line-color': '#2b2a26', 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [1.5, 2] } })
        map.addLayer({ id: `${OUTLINE_SOURCE}-line`, type: 'line', source: OUTLINE_SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.9 } })
        hover = addAreaHover(map, areas, locale, (id) => callbacks.current.onSelectArea(id), `${WALK_CIRCLE_SOURCE}-fill`, maplibregl.Marker)
        hoverRef.current = hover
        mapRef.current = map
        // Narrow screens at city zoom: dots only, the label comes on tap. Sixteen labels in a 100 px band read as broken.
        const dotsOnly = () => map!.getContainer().classList.toggle('tm-map--dots', window.innerWidth < 768 && map!.getZoom() < 13)
        dotsOnly()
        map.on('zoomend', dotsOnly)
        map.on('resize', dotsOnly)
        setMapReady((n) => n + 1)
      })
    })()
    return () => {
      cancelled = true
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      popupRef.current?.remove()
      popupRef.current = null
      hover?.remove()
      hoverRef.current = null
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
          // Phones get the short name (before "and" or a bracket); the full name is in the guide.
          const full = t(a.name, locale)
          const el = pinElement(window.innerWidth < 768 ? full.split(/ and | \(/)[0] : full, `var(--${a.color})`, false, false)
          // The area names are the way in; they stay on at city zoom, where the place labels go.
          el.classList.add('tm-pin--area')
          el.addEventListener('click', () => callbacks.current.onSelectArea(a.id))
          // Phones stack the name under its dot, centred, so neighbouring areas do not run into each other.
          const stacked = window.innerWidth < 768
          if (stacked) el.classList.add('tm-pin--stack')
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: stacked ? 'top' : 'left' }).setLngLat(a.camera.center).addTo(map))
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
    const bounds = focusBounds(pins, stations, centres, outlines)
    if (!bounds) {
      // A phone is tall and narrow: the city camera is set for a wide screen, so frame the eight area labels instead.
      if (window.innerWidth < 768 && areas.length > 0) {
        const pts = areas.map((a) => a.camera.center)
        const cam = map.cameraForBounds([[Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]], { padding: { top: 60, bottom: 120, left: 36, right: 36 }, maxZoom: 13 })
        if (cam) {
          map.flyTo({ center: cam.center, zoom: cam.zoom, pitch: 0, bearing: 0, duration: 1400, essential: true })
          return
        }
      }
      map.flyTo({ center: cityCamera.center, zoom: cityCamera.zoom, pitch: threeD ? cityCamera.pitch : 0, bearing: threeD ? cityCamera.bearing : 0, duration: 1400, essential: true })
      return
    }
    // Zoom is worked out flat, then the tilt is applied on top: fitting a
    // pitched view directly zooms out far enough to show the whole tilted
    // trapezoid, which left a ticked area as a small patch in the middle.
    const cam = map.cameraForBounds(bounds, { padding: 28, maxZoom: 16, bearing: threeD ? -12 : 0 })
    if (!cam) return
    map.flyTo({ center: cam.center, zoom: (cam.zoom ?? cityCamera.zoom) + (threeD ? 0.3 : 0), pitch: threeD ? 50 : 0, bearing: threeD ? -12 : 0, duration: 1400, essential: true })
  }, [pins, stations, centres, outlines, areas, threeD, cityCamera, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(WALK_CIRCLE_SOURCE) as { setData?: (d: GeoJSON.GeoJSON) => void } | undefined
    src?.setData?.({ type: 'FeatureCollection', features: stations.map((st) => circlePolygon(st.lon, st.lat, WALK_RADIUS_M)) })
  }, [stations, mapReady])

  // The card on the active pin. One popup, replaced whenever the pin changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Drop the ref before removing: remove() fires 'close', which must not read as the user closing the card.
    const previous = popupRef.current
    popupRef.current = null
    previous?.remove()
    const threads = map.getSource(NEARBY_SOURCE) as { setData?: (d: GeoJSON.GeoJSON) => void } | undefined
    const hit = activePinId ? pins.find((p) => p.pin.id === activePinId) : undefined
    if (!hit) {
      threads?.setData?.({ type: 'FeatureCollection', features: [] })
      return
    }
    const nearby = nearbyPins(hit.pin, allPins)
    threads?.setData?.({
      type: 'FeatureCollection',
      features: nearby.map((n) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[hit.pin.location.lon, hit.pin.location.lat], [n.pin.location.lon, n.pin.location.lat]] } })),
    })
    let cancelled = false
    let stopFit: (() => void) | null = null
    ;(async () => {
      const maplibregl = await loadMaplibreGl()
      if (cancelled) return
      const { pin, area } = hit
      const station = pin.walk ? stationById.get(pin.walk.station) : undefined
      // On a phone the card always hangs above the pin (the pin is eased down to make room); a wide screen lets MapLibre pick the side.
      const narrowScreen = map.getContainer().clientWidth < 768
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '300px', className: 'tm-card-popup', anchor: narrowScreen ? 'bottom' : undefined })
        .setLngLat([pin.location.lon, pin.location.lat])
        .setDOMContent(cardElement(locale, cityId, pin, area, station, nearby, () => callbacks.current.onClosePin(), (next) => callbacks.current.onSelectPin(next)))
        .addTo(map)
      popup.on('close', () => {
        if (popupRef.current === popup) callbacks.current.onClosePin()
      })
      popupRef.current = popup
      // Keep the whole card on screen: measure the rendered card and pan by
      // exactly what sticks out, allowing for the controls and, on a phone, the
      // list handle or sheet over the bottom of the map. Measured, not guessed,
      // so it holds for any card height, map size and pin position.
      stopFit = fitPopupSoon(map, popup, () => overlayInsets(map))
    })()
    return () => {
      cancelled = true
      stopFit?.()
    }
  }, [activePinId, pins, allPins, stationById, locale, cityId, mapReady])

  // Outlines of the ticked areas. The colour comes from the same CSS token
  // the labels use, read once per update so the map and the panel agree.
  // A ticked area gets no hover card any more, just its name pill at its centre.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    hoverRef.current?.setSelected(outlines.filter((o) => areas.some((a) => a.id === o.id)).map((o) => o.id))
    const src = map.getSource(OUTLINE_SOURCE) as { setData?: (d: GeoJSON.GeoJSON) => void } | undefined
    const styles = getComputedStyle(document.documentElement)
    const features: GeoJSON.Feature[] = outlines.map((o) => ({ type: 'Feature', properties: { color: styles.getPropertyValue(`--${o.color}`).trim() || '#c8553d' }, geometry: o.boundary }))
    src?.setData?.({ type: 'FeatureCollection', features })
  }, [outlines, areas, mapReady])

  // Streets and zones of the visible places, stronger for the selected one.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(SHAPE_SOURCE) as { setData?: (d: GeoJSON.GeoJSON) => void } | undefined
    const styles = getComputedStyle(document.documentElement)
    const features: GeoJSON.Feature[] = []
    const zones: GeoJSON.Position[][][] = []
    for (const { pin, area } of pins) {
      if (!pin.geometry) continue
      features.push({ type: 'Feature', properties: { color: styles.getPropertyValue(`--${area.color}`).trim() || '#c8553d', active: pin.id === activePinId }, geometry: pin.geometry })
      if (pin.geometry.type === 'MultiPolygon') zones.push(...pin.geometry.coordinates)
    }
    src?.setData?.({ type: 'FeatureCollection', features })
    if (map.getLayer(BUILDING_TINT_LAYER)) map.setFilter(BUILDING_TINT_LAYER, zones.length ? ['within', { type: 'MultiPolygon', coordinates: zones }] : ['boolean', false])
  }, [pins, activePinId, mapReady])

  return <div ref={containerRef} className="h-full w-full bg-paper" aria-label="Map" role="region" />
}
