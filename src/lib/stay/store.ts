import { useSyncExternalStore } from 'react'

/**
 * The visitor's dates: check-in and check-out as YYYY-MM-DD, kept in this
 * browser only (localStorage, no account). Every booking link on the site
 * carries them, so the hotel page opens priced for the stay instead of for
 * "tonight". Null means no dates picked and the links stay plain.
 */
export type Stay = { checkIn: string; checkOut: string }

const KEY = 'tm.stay.v1'
const EVENT = 'tm-stay'
const DATE = /^\d{4}-\d{2}-\d{2}$/

let cacheRaw: string | null = null
let cache: Stay | null = null

function valid(x: unknown): x is Stay {
  if (!x || typeof x !== 'object') return false
  const { checkIn, checkOut } = x as Record<string, unknown>
  return typeof checkIn === 'string' && typeof checkOut === 'string' && DATE.test(checkIn) && DATE.test(checkOut) && checkOut > checkIn
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

/** Stores the dates when both are present and in order; anything else clears them. */
export function setStay(checkIn: string, checkOut: string) {
  write(valid({ checkIn, checkOut }) ? { checkIn, checkOut } : null)
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

export function todayIso(): string {
  return iso(new Date())
}
