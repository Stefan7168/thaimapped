import { useSyncExternalStore } from 'react'

/**
 * The visitor's dates: check-in and check-out as YYYY-MM-DD, kept in this
 * browser only (localStorage, no account). Every booking link on the site
 * carries them, so the hotel page opens priced for the stay instead of for
 * "tonight". Null means no dates picked and the links stay plain.
 */
/** The dates, and who is going (adults, 2 when unset; children, 0 when unset), so booking searches open on the right party. Children's ages are asked by the booking site itself, never guessed here. */
export type Stay = { checkIn: string; checkOut: string; adults?: number; children?: number }
export const MAX_ADULTS = 6
export const MAX_CHILDREN = 4

const KEY = 'tm.stay.v1'
const EVENT = 'tm-stay'
const DATE = /^\d{4}-\d{2}-\d{2}$/

let cacheRaw: string | null = null
let cache: Stay | null = null

function valid(x: unknown): x is Stay {
  if (!x || typeof x !== 'object') return false
  const { checkIn, checkOut, adults, children } = x as Record<string, unknown>
  const party = adults === undefined || (Number.isInteger(adults) && (adults as number) >= 1 && (adults as number) <= MAX_ADULTS)
  const kids = children === undefined || (Number.isInteger(children) && (children as number) >= 0 && (children as number) <= MAX_CHILDREN)
  return typeof checkIn === 'string' && typeof checkOut === 'string' && DATE.test(checkIn) && DATE.test(checkOut) && checkOut > checkIn && party && kids
}

function read(): Stay | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === cacheRaw) return cache
    cacheRaw = raw
    const parsed: unknown = raw ? JSON.parse(raw) : null
    cache = valid(parsed) ? parsed : null
  } catch {
    // Private windows and blocked storage: no dates, plain links.
  }
  return cache
}

function write(stay: Stay | null) {
  try {
    if (stay) window.localStorage.setItem(KEY, JSON.stringify(stay))
    else window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to do: the page keeps working without dates.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function stayNow(): Stay | null {
  return typeof window === 'undefined' ? null : read()
}

/** Stores the dates when both are present and in order; anything else clears them. The party size carries over unless given. */
export function setStay(checkIn: string, checkOut: string, adults: number | undefined = stayNow()?.adults, children: number | undefined = stayNow()?.children) {
  const next: Stay = { checkIn, checkOut }
  if (adults !== undefined) next.adults = adults
  if (children !== undefined) next.children = children
  write(valid(next) ? next : null)
}

/** How many adults the booking searches open for; needs dates to live in. */
export function setAdults(adults: number) {
  const cur = stayNow()
  if (!cur) return
  const n = Math.min(MAX_ADULTS, Math.max(1, Math.round(adults)))
  write({ ...cur, adults: n })
}

export function adultsOf(stay: Stay | null): number {
  return stay?.adults ?? 2
}

/** Children travelling, 0 to 4; the booking site asks their ages. Needs dates to live in. */
export function setChildren(children: number) {
  const cur = stayNow()
  if (!cur) return
  const n = Math.min(MAX_CHILDREN, Math.max(0, Math.round(children)))
  const { children: _drop, ...rest } = cur
  void _drop
  write(n === 0 ? rest : { ...rest, children: n })
}

export function childrenOf(stay: Stay | null): number {
  return stay?.children ?? 0
}

/** Rooms for the party, two to a room: a search for 5 adults in 1 room shows almost nothing. */
export function roomsOf(stay: Stay | null): number {
  return Math.ceil(adultsOf(stay) / 2)
}

export function clearStay() {
  write(null)
}

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** The dates, live; null on the server and until the page is live in the browser. */
export function useStay(): Stay | null {
  return useSyncExternalStore(subscribe, stayNow, () => null)
}

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function nights(stay: Stay): number {
  const a = Date.UTC(+stay.checkIn.slice(0, 4), +stay.checkIn.slice(5, 7) - 1, +stay.checkIn.slice(8, 10))
  const b = Date.UTC(+stay.checkOut.slice(0, 4), +stay.checkOut.slice(5, 7) - 1, +stay.checkOut.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

/** The coming Friday to Sunday in the visitor's local time; from Saturday on it is next week's. */
export function nextWeekend(today = new Date()): Stay {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dow = d.getDay() // 0 Sunday ... 5 Friday
  let ahead = (5 - dow + 7) % 7
  if (ahead === 0 && dow !== 5) ahead = 7
  if (dow === 6 || dow === 0) ahead = (5 - dow + 7) % 7 || 7
  d.setDate(d.getDate() + ahead)
  const out = new Date(d)
  out.setDate(out.getDate() + 2)
  return { checkIn: iso(d), checkOut: iso(out) }
}

/** A date moved by whole days, as YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return iso(d)
}

/** The days of a stay a trip of `days` days can start on and still end by check-out; check-in alone when the trip is longer than the stay. */
export function tripStartOptions(stay: Stay, days: number): string[] {
  const out: string[] = []
  for (let n = 0; n <= nights(stay) - (days - 1); n++) out.push(addDays(stay.checkIn, n))
  return out.length > 0 ? out : [stay.checkIn]
}

/** The default start of a trip inside a stay: the latest day that gets you back by check-out, so a two-day trip in a Friday to Sunday stay runs Saturday to Sunday. */
export function tripStartDefault(stay: Stay, days: number): string {
  const options = tripStartOptions(stay, days)
  return options[options.length - 1]
}

/** The same stay moved by whole days, for "next weekend". */
export function shiftStay(stay: Stay, days: number): Stay {
  const move = (s: string) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + days); return iso(d) }
  return { checkIn: move(stay.checkIn), checkOut: move(stay.checkOut) }
}

/** The dates as one URL value, "2026-10-16_2026-10-18", so a shared link carries them. */
export function stayParam(stay: Stay): string {
  return `${stay.checkIn}_${stay.checkOut}`
}

export function parseStayParam(value: string | null): Stay | null {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/)
  if (!m) return null
  const stay = { checkIn: m[1], checkOut: m[2] }
  return valid(stay) ? stay : null
}

/** Takes the dates from a shared address ("?stay=") when the visitor has none of their own yet. */
export function adoptStayFromUrl() {
  const sent = parseStayParam(new URLSearchParams(window.location.search).get('stay'))
  if (sent && !read()) write(sent)
}

export function todayIso(): string {
  return iso(new Date())
}
