import type { ExpressionSpecification, Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'

type LayerMouseEvent = MapMouseEvent & { features?: GeoJSON.Feature[] }
type MarkerLike = { setLngLat: (l: [number, number]) => MarkerLike; addTo: (m: MaplibreMap) => MarkerLike; remove: () => void }
type MarkerCtor = new (o: { element: HTMLElement; anchor: 'left' }) => MarkerLike
const TOP_PINS = 3
/** The area's places, the ones with a photograph first: those are its highlights. */
const topPlaces = (a: Area) => a.pins.filter((p) => p.kind !== 'hotel').sort((x, y) => Number(Boolean(y.photo)) - Number(Boolean(x.photo))).slice(0, TOP_PINS)
import type { Area, Locale } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'

const SOURCE = 'tm-area-hover'
const HIT_LAYER = `${SOURCE}-hit`

/**
 * Lets the eight areas light up under the pointer: a soft fill and a crisp
 * outline in the area's own colour, and a small label with its name and
 * tagline that follows the cursor. A click (or a tap on touch screens, where
 * there is no hover) hands the area to `onSelect`. Call once after the
 * style has loaded; `beforeId` puts the layers under the caller's own.
 */
export function addAreaHover(map: MaplibreMap, areas: Area[], locale: Locale, onSelect: (areaId: string) => void, beforeId: string | undefined, Marker: MarkerCtor): () => void {
  const s = strings(locale)
  const styles = getComputedStyle(document.documentElement)
  const features: GeoJSON.Feature[] = areas
    .filter((a) => a.boundary)
    .map((a) => ({ type: 'Feature', id: a.id, properties: { id: a.id, color: styles.getPropertyValue(`--${a.color}`).trim() || '#c8553d' }, geometry: a.boundary! }))
  map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features }, promoteId: 'id' })
  const hover: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false]
  map.addLayer({ id: HIT_LAYER, type: 'fill', source: SOURCE, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', hover, 0.14, 0] } }, beforeId)
  map.addLayer({ id: `${SOURCE}-line`, type: 'line', source: SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': ['case', hover, 0.9, 0] } }, beforeId)

  const label = document.createElement('div')
  label.className = 'tm-area-hover'
  label.hidden = true
  map.getContainer().append(label)
  const byId = new Map(areas.map((a) => [a.id, a]))
  let current: string | null = null

  let topMarkers: MarkerLike[] = []
  const clearTopPins = () => {
    topMarkers.forEach((m) => m.remove())
    topMarkers = []
  }
  // The area's first three places (hotels aside) appear as dots while the pointer is over it; their names are in the card.
  const showTopPins = (a: Area) => {
    clearTopPins()
    for (const pin of topPlaces(a)) {
      const el = document.createElement('div')
      el.className = 'tm-pin tm-pin--minor tm-pin--hover'
      el.style.setProperty('--pin', `var(--${a.color})`)
      const dot = document.createElement('span')
      dot.className = 'tm-pin__dot'
      el.append(dot)
      topMarkers.push(new Marker({ element: el, anchor: 'left' }).setLngLat([pin.location.lon, pin.location.lat]).addTo(map))
    }
  }
  const fillCard = (a: Area) => {
    label.innerHTML = ''
    label.style.setProperty('--pin', `var(--${a.color})`)
    const photo = a.photos?.[0]
    if (photo) {
      const img = document.createElement('img')
      img.src = `/_next/image?url=${encodeURIComponent(photo.src)}&w=384&q=75`
      img.alt = ''
      img.width = 220
      img.height = 124
      label.append(img)
    }
    const body = document.createElement('div')
    body.className = 'tm-area-hover__body'
    const name = document.createElement('strong')
    name.textContent = t(a.name, locale)
    const line = document.createElement('span')
    line.textContent = t(a.tagline, locale)
    body.append(name, line)
    if (a.fits.length > 0) {
      const fits = document.createElement('span')
      fits.className = 'tm-area-hover__fits'
      fits.textContent = a.fits.map((f) => s.guide.fits[f] ?? f).join(' · ')
      body.append(fits)
    }
    const places = a.pins.filter((p) => p.kind !== 'hotel')
    const hotels = a.pins.filter((p) => p.kind === 'hotel')
    if (places.length > 0) {
      const top = document.createElement('span')
      top.className = 'tm-area-hover__top'
      top.textContent = topPlaces(a).map((p) => t(p.name, locale)).join(' · ')
      body.append(top)
    }
    const meta = document.createElement('span')
    meta.className = 'tm-area-hover__meta'
    meta.textContent = s.guide.hoverMeta(places.length, hotels.length)
    body.append(meta)
    label.append(body)
  }
  const leave = () => {
    if (current) map.setFeatureState({ source: SOURCE, id: current }, { hover: false })
    current = null
    clearTopPins()
    label.hidden = true
    map.getCanvas().style.cursor = ''
  }
  const move = (e: LayerMouseEvent) => {
    const id = (e.features?.[0]?.id as string | undefined) ?? null
    if (id !== current) {
      if (current) map.setFeatureState({ source: SOURCE, id: current }, { hover: false })
      current = id
      if (id) {
        map.setFeatureState({ source: SOURCE, id }, { hover: true })
        const a = byId.get(id)
        if (a) {
          fillCard(a)
          showTopPins(a)
        }
        label.hidden = false
        map.getCanvas().style.cursor = 'pointer'
      }
    }
    if (id) {
      const box = map.getContainer().getBoundingClientRect()
      const w = label.offsetWidth || 220
      const h = label.offsetHeight || 200
      const x = e.point.x + 14 + w > box.width ? e.point.x - 14 - w : e.point.x + 14
      const y = e.point.y + 14 + h > box.height ? e.point.y - 14 - h : e.point.y + 14
      label.style.left = `${Math.max(0, x)}px`
      label.style.top = `${Math.max(0, y)}px`
    }
  }
  const click = (e: LayerMouseEvent) => {
    const id = e.features?.[0]?.id as string | undefined
    if (id) onSelect(id)
  }
  map.on('mousemove', HIT_LAYER, move)
  map.on('mouseleave', HIT_LAYER, leave)
  map.on('click', HIT_LAYER, click)
  return () => {
    map.off('mousemove', HIT_LAYER, move)
    map.off('mouseleave', HIT_LAYER, leave)
    map.off('click', HIT_LAYER, click)
    clearTopPins()
    label.remove()
  }
}
