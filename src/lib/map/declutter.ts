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
const LEFT = 'tm-pin--left'
const STACK = 'tm-pin--stack'
const UP = 'tm-pin--up'
const SIDE_R = 'tm-pin--sr'
const SIDE_L = 'tm-pin--sl'

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
  // Every pass starts from the resting places: a box measured with last pass's lift or side shift still on would be stale once that class is stripped below.
  for (const l of labels) {
    l.classList.remove(OFF)
    l.closest<HTMLElement>('.tm-pin')?.classList.remove(UP, SIDE_R, SIDE_L)
  }
  // A label that would run off the right edge sits on the left of its dot instead.
  const bounds = container?.getBoundingClientRect()
  if (bounds) {
    for (const l of labels) {
      const pin = l.closest<HTMLElement>('.tm-pin')
      if (!pin) continue
      pin.classList.remove(LEFT)
      const r = l.getBoundingClientRect()
      if (r.width > 0 && r.right > bounds.right - 4 && r.width < bounds.width / 2) pin.classList.add(LEFT)
    }
  }
  const rects = labels.map((l) => l.getBoundingClientRect())
  // The picked area's name pill (area-hover.ts) and every stop number have the spot first.
  const kept: DOMRect[] = [...(container?.querySelectorAll<HTMLElement>('.tm-area-pill, .tm-stop__num') ?? [])].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0)
  const hits = (r: DOMRect) => kept.some((k) => r.left < k.right + 1 && r.right > k.left - 1 && r.top < k.bottom + 1 && r.bottom > k.top - 1)
  const outside = (r: DOMRect) => !!bounds && (r.left < bounds.left + 4 || r.right > bounds.right - 4 || r.top < bounds.top + 4)
  labels.forEach((l, i) => {
    let r = rects[i]
    if (r.width === 0) return
    const pin = l.closest<HTMLElement>('.tm-pin')
    let hit = hits(r)
    // A stacked name that would cover a neighbour tries above its dot, then
    // beside it (right, then left), before giving up; a spot off the map does not count.
    if (hit && pin?.classList.contains(STACK)) {
      for (const cls of [UP, SIDE_R, SIDE_L]) {
        pin.classList.add(cls)
        r = l.getBoundingClientRect()
        hit = hits(r) || outside(r)
        if (!hit) break
        pin.classList.remove(cls)
      }
    } else if (hit && pin && !pin.classList.contains(LEFT)) {
      // A name beside its dot (desktop) tries the other side of the dot before giving up.
      pin.classList.add(LEFT)
      r = l.getBoundingClientRect()
      hit = hits(r) || outside(r)
      if (hit) pin.classList.remove(LEFT)
    }
    if (hit) l.classList.add(OFF)
    else kept.push(r)
  })
  // A stacked name still hidden by exactly one neighbour on the same row: lift
  // that neighbour above its own dot and try again (Thonglor beside Sukhumvit on a narrow phone).
  const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right + 1 && a.right > b.left - 1 && a.top < b.bottom + 1 && a.bottom > b.top - 1
  const moved = (pin: HTMLElement) => pin.classList.contains(UP) || pin.classList.contains(SIDE_R) || pin.classList.contains(SIDE_L)
  for (const l of labels) {
    const pin = l.closest<HTMLElement>('.tm-pin')
    if (!l.classList.contains(OFF) || !pin?.classList.contains(STACK)) continue
    const r = l.getBoundingClientRect()
    const blockers = labels.filter((o) => o !== l && !o.classList.contains(OFF) && overlaps(r, o.getBoundingClientRect()))
    if (blockers.length !== 1 || kept.some((k) => !labels.some((o) => !o.classList.contains(OFF) && o.getBoundingClientRect().left === k.left && o.getBoundingClientRect().top === k.top) && overlaps(r, k))) continue
    const other = blockers[0]
    const otherPin = other.closest<HTMLElement>('.tm-pin')
    if (!otherPin?.classList.contains(STACK) || moved(otherPin)) continue
    const before = other.getBoundingClientRect()
    otherPin.classList.add(UP)
    const after = other.getBoundingClientRect()
    const idx = kept.findIndex((k) => k.left === before.left && k.top === before.top)
    const rest = kept.filter((_, i) => i !== idx)
    if (outside(after) || rest.some((k) => overlaps(after, k)) || outside(r) || rest.some((k) => overlaps(r, k))) {
      otherPin.classList.remove(UP)
      continue
    }
    if (idx >= 0) kept[idx] = after
    kept.push(r)
    l.classList.remove(OFF)
  }
}

type Projecting = { project: (lngLat: [number, number]) => { x: number; y: number } }

/**
 * Numbered pins (a hotel and a sight in one building) sat on top of each
 * other. Each number keeps its spot unless it would cover an earlier one;
 * then it slides to the first free spot around it (right, left, below,
 * above, the diagonals), one pin's width away. Offsets reset every pass so a
 * zoom-in puts the pins back on their true places.
 */
const STEP = 26
const SLOTS: [number, number][] = [[0, 0], [STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP], [STEP, STEP], [-STEP, STEP], [STEP, -STEP], [-STEP, -STEP], [STEP * 2, 0], [-STEP * 2, 0]]

export function spreadNumbers(markers: Marker[], map: Projecting) {
  const placed: { x: number; y: number }[] = []
  for (const m of markers) {
    const el = m.getElement()
    if (!el.classList.contains('tm-pin--num') && !el.classList.contains('tm-stop')) continue
    const ll = m.getLngLat()
    const p = map.project([ll.lng, ll.lat])
    const slot = SLOTS.find(([dx, dy]) => !placed.some((q) => Math.abs(q.x - (p.x + dx)) < STEP - 2 && Math.abs(q.y - (p.y + dy)) < STEP - 2)) ?? [0, 0]
    m.setOffset(slot)
    placed.push({ x: p.x + slot[0], y: p.y + slot[1] })
  }
}

/** Re-runs the pass on every camera move, one frame at a time. Returns the detach function. */
export function watchDeclutter(map: { on: (ev: string, fn: () => void) => void; off: (ev: string, fn: () => void) => void; getContainer: () => HTMLElement } & Projecting, markers: () => Marker[]): () => void {
  let frame = 0
  const run = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      spreadNumbers(markers(), map)
      declutterLabels(markers(), map.getContainer())
    })
  }
  for (const ev of ['move', 'moveend', 'resize', 'idle']) map.on(ev, run)
  return () => {
    cancelAnimationFrame(frame)
    for (const ev of ['move', 'moveend', 'resize', 'idle']) map.off(ev, run)
  }
}
