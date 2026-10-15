import type { ExpressionSpecification, Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'

type LayerMouseEvent = MapMouseEvent & { features?: GeoJSON.Feature[] }
import type { Area, Locale } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'

const SOURCE = 'tm-area-hover'
const HIT_LAYER = `${SOURCE}-hit`

/**
 * Lets the eight areas light up under the pointer: a soft fill and a crisp
 * outline in the area's own colour, and a small label with its name and
 * tagline that follows the cursor. A click (or a tap on touch screens, where
 * there is no hover) hands the area to `onSelect`. Call once after the
 * style has loaded; `beforeId` puts the layers under the caller's own.
 */
export function addAreaHover(map: MaplibreMap, areas: Area[], locale: Locale, onSelect: (areaId: string) => void, beforeId?: string): () => void {
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

  const leave = () => {
    if (current) map.setFeatureState({ source: SOURCE, id: current }, { hover: false })
    current = null
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
          label.innerHTML = ''
          const name = document.createElement('strong')
          name.textContent = t(a.name, locale)
          const line = document.createElement('span')
          line.textContent = t(a.tagline, locale)
          label.append(name, line)
          label.style.setProperty('--pin', `var(--${a.color})`)
        }
        label.hidden = false
        map.getCanvas().style.cursor = 'pointer'
      }
    }
    if (id) {
      label.style.left = `${e.point.x + 14}px`
      label.style.top = `${e.point.y + 14}px`
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
    label.remove()
  }
}
