import { useSyncExternalStore } from 'react'
import { addDays, dayTripOptions, nights, tripStartDefault, tripStartOptions, type Stay } from './store'
import type { RouteStop, TripRoute } from '@/lib/content/types'

/**
 * The start day the visitor picked for a trip on its page, kept in this
 * browser so the weekend page, the saved list and the calendar files
 * place the trip on the same day. Keyed by route id; a pick outside the
 * current stay is ignored, not deleted.
 */
const KEY = 'tm.tripstart.v1'
const EVENT = 'tm-tripstart'
const EMPTY: Readonly<Record<string, string>> = {}

let cacheRaw: string | null = null
let cache: Readonly<Record<string, string>> = EMPTY

function read(): Readonly<Record<string, string>> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === cacheRaw) return cache
    cacheRaw = raw
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')) : EMPTY
  } catch {
    // Private windows and blocked storage: no picks, the defaults hold.
  }
  return cache
}

export function setTripStartPick(routeId: string, day: string | null) {
  const next = { ...read() }
  if (day) next[routeId] = day
  else delete next[routeId]
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Nothing to do.
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** The picks, live; empty on the server and until the page is live in the browser. */
export function useTripStartPicks(): Readonly<Record<string, string>> {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}

/** The days a trip may start on inside the stay: any day back by check-out for a road trip, the fitting days for a day trip. */
export function tripDayOptions(stay: Stay, r: Pick<TripRoute, 'days' | 'duration'>): string[] {
  return r.days > 1 ? tripStartOptions(stay, r.days) : dayTripOptions(stay, r.duration)
}

/** The day a trip starts: the visitor's pick when it is still inside the stay, else the default (the latest fitting day). Null when nothing fits. */
export function tripStartFor(stay: Stay, r: Pick<TripRoute, 'id' | 'days' | 'duration'>, picks: Readonly<Record<string, string>>): string | null {
  if (r.days > nights(stay) + 1) return null
  const options = tripDayOptions(stay, r)
  const pick = picks[r.id]
  if (pick && options.includes(pick)) return pick
  return r.days > 1 ? tripStartDefault(stay, r.days) : (options.at(-1) ?? null)
}

/** The nights of the stay (as check-in dates) a plan road trip sleeps away, so the hotel here is only for the rest. */
export function awayNights(stay: Stay, routes: readonly (Pick<TripRoute, 'id' | 'days' | 'duration'> & { stops: readonly Pick<RouteStop, 'kind' | 'day'>[] })[], planIds: readonly string[], picks: Readonly<Record<string, string>>): string[] {
  const out = new Set<string>()
  for (const r of routes) {
    if (!planIds.includes(r.id) || r.days < 2) continue
    const from = tripStartFor(stay, r, picks)
    if (!from) continue
    for (const st of r.stops) {
      if (st.kind !== 'hotel') continue
      const d = addDays(from, st.day - 1)
      if (d >= stay.checkIn && d < stay.checkOut) out.add(d)
    }
  }
  return [...out].sort()
}
