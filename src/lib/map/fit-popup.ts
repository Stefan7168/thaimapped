import type { Map as MaplibreMap, Popup } from 'maplibre-gl'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Pans the map by exactly the amount a popup's card sticks out of the map
 * (plus the insets, for controls and overlays), so the whole card is on
 * screen. Measured from the rendered card, not guessed from the pin, so it
 * holds for any card height and any map size. A card taller than the room
 * first loses its nearby list, then its photos; if it still does not fit,
 * its top edge wins.
 */
export function fitPopup(map: MaplibreMap, popup: Popup, insets: Insets, duration = 300): boolean {
  const el = popup.getElement()
  if (!el || !popup.isOpen()) return false
  const card = el.querySelector<HTMLElement>('.maplibregl-popup-content') ?? el
  const box = map.getContainer().getBoundingClientRect()
  const minX = box.left + insets.left
  const maxX = box.right - insets.right
  let minY = box.top + insets.top
  let maxY = box.bottom - insets.bottom
  let r = card.getBoundingClientRect()
  // Taller than the room: first drop the nearby list (the short card), so the
  // photos stay; only if it is still too tall drop the photos as well (the
  // compact card). Measured after each step, so the name, the line and the
  // links stay whole.
  if (r.height > maxY - minY - 24) {
    card.querySelector('.tm-card')?.classList.add('tm-card--short')
    r = card.getBoundingClientRect()
  }
  if (r.height > maxY - minY - 24) {
    card.querySelector('.tm-card')?.classList.add('tm-card--compact')
    r = card.getBoundingClientRect()
  }
  // Still taller: the overlays' room is given up and only the map's own edges count.
  if (r.height > maxY - minY) {
    minY = box.top + 8
    maxY = box.bottom - 8
  }
  let dx = 0
  let dy = 0
  if (r.width > maxX - minX || r.left < minX) dx = r.left - minX
  else if (r.right > maxX) dx = r.right - maxX
  if (r.height > maxY - minY || r.top < minY) dy = r.top - minY
  else if (r.bottom > maxY) dy = r.bottom - maxY
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return false
  map.panBy([dx, dy], { duration, essential: true })
  return true
}

/**
 * The room overlays leave on the map: anything inside the map's parent that
 * carries `data-map-overlay="top|right|bottom|left"` is measured and added
 * to that side, so a phone's list handle or sheet never hides a card.
 */
export function overlayInsets(map: MaplibreMap, base = 12): Insets {
  const insets: Insets = { top: base, right: base, bottom: base, left: base }
  const container = map.getContainer()
  const scope = container.parentElement ?? container
  const box = container.getBoundingClientRect()
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>('[data-map-overlay]'))) {
    if (el.offsetParent === null) continue
    const side = el.dataset.mapOverlay as keyof Insets
    const r = el.getBoundingClientRect()
    const size = side === 'top' ? r.bottom - box.top : side === 'bottom' ? box.bottom - r.top : side === 'left' ? r.right - box.left : box.right - r.left
    if (size > 0) insets[side] = Math.max(insets[side], size + base)
  }
  return insets
}

/**
 * Fits once the card has laid out and the map is still, then checks again
 * after each pan it makes (on a tilted map a screen pan does not move a
 * far-off card by exactly the same amount), up to four rounds, until the
 * card is inside. Returns a function that stops the rounds.
 */
export function fitPopupSoon(map: MaplibreMap, popup: Popup, insets: () => Insets): () => void {
  let frame = 0
  let timer = 0
  let alive = true
  let rounds = 0
  const run = () => {
    if (!alive) return
    if (map.isMoving()) {
      map.once('moveend', onEnd)
      return
    }
    const moved = fitPopup(map, popup, insets())
    rounds += 1
    if (moved && rounds < 6) map.once('moveend', onEnd)
  }
  const onEnd = () => {
    if (alive) frame = requestAnimationFrame(run)
  }
  frame = requestAnimationFrame(run)
  // Belt and braces: a late layout (fonts, the photo's box) gets one more look.
  timer = window.setTimeout(() => {
    if (alive && !map.isMoving() && rounds < 6) run()
  }, 600)
  return () => {
    alive = false
    cancelAnimationFrame(frame)
    window.clearTimeout(timer)
    map.off('moveend', onEnd)
  }
}
