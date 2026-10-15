import type { Marker } from 'maplibre-gl'

/**
 * Markers do not avoid each other, so at a walk-circle zoom four labels in
 * 300 m sat on top of one another. Priority order: the active marker, then
 * stations, hotels, the rest, dimmed ones last; a label that would cover an
 * earlier one is hidden (its dot or number stays) until the map is zoomed in
 * enough for it. Works on the explorer's pins and the stage map's trip stops.
 */
const LABEL = '.tm-pin__label, .tm-stop__label'
const OFF = 'tm-label--off'

function rank(el: HTMLElement): number {
  if (el.classList.contains('tm-pin--active') || el.classList.contains('tm-stop--active')) return 0
  if (el.classList.contains('tm-pin--station')) return 1
  if (el.classList.contains('tm-stop--dim')) return 4
  if (el.classList.contains('tm-pin--minor')) return 3
  return 2
}

export function declutterLabels(markers: Marker[], container: HTMLElement | null) {
  const ordered = markers.map((m, i) => ({ el: m.getElement(), i })).sort((a, b) => rank(a.el) - rank(b.el) || a.i - b.i)
  const labels = ordered.map(({ el }) => el.querySelector<HTMLElement>(LABEL)).filter((l): l is HTMLElement => !!l)
  for (const l of labels) l.classList.remove(OFF)
  const rects = labels.map((l) => l.getBoundingClientRect())
  // The picked area's name pill (area-hover.ts) has the spot first.
  const kept: DOMRect[] = [...(container?.querySelectorAll<HTMLElement>('.tm-area-pill') ?? [])].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0)
  labels.forEach((l, i) => {
    const r = rects[i]
    if (r.width === 0) return
    const hit = kept.some((k) => r.left < k.right + 2 && r.right > k.left - 2 && r.top < k.bottom + 2 && r.bottom > k.top - 2)
    if (hit) l.classList.add(OFF)
    else kept.push(r)
  })
}

/** Re-runs the pass on every camera move, one frame at a time. Returns the detach function. */
export function watchDeclutter(map: { on: (ev: string, fn: () => void) => void; off: (ev: string, fn: () => void) => void; getContainer: () => HTMLElement }, markers: () => Marker[]): () => void {
  let frame = 0
  const run = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => declutterLabels(markers(), map.getContainer()))
  }
  for (const ev of ['move', 'moveend', 'resize']) map.on(ev, run)
  return () => {
    cancelAnimationFrame(frame)
    for (const ev of ['move', 'moveend', 'resize']) map.off(ev, run)
  }
}
