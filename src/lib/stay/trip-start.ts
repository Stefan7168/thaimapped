import { useMemo, useSyncExternalStore } from 'react'
import { useKeptTrips } from '@/lib/saved/trips'
import { addDays, dayTripOptions, nights, tripStartDefault, tripStartOptions, type Stay } from './store'
import type { RouteStop, TripRoute } from '@/lib/content/types'
import { TRIP_HOURS } from './calendar'
import type { TripNights } from '@/lib/content/slim'

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

/** Several picks at once (the days a shared plan came with, kept along with its trips). */
export function addTripStartPicks(picks: Readonly<Record<string, string>>) {
  const entries = Object.entries(picks)
  if (entries.length === 0) return
  const next = { ...read(), ...Object.fromEntries(entries) }
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

/** The `starts=` link parameter: `id:YYYY-MM-DD` pairs for the trips with a pick, so a shared plan keeps its days. */
export function startsParam(ids: readonly string[], picks: Readonly<Record<string, string>>): string | null {
  const pairs = ids.filter((id) => picks[id]).map((id) => `${id}:${picks[id]}`)
  return pairs.length > 0 ? pairs.join(',') : null
}

/** The picks a shared link carries, read from `starts=`; malformed pairs are dropped. */
export function parseStarts(raw: string | null): Readonly<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const pair of (raw ?? '').split(',')) {
    const i = pair.lastIndexOf(':')
    if (i > 0 && /^\d{4}-\d{2}-\d{2}$/.test(pair.slice(i + 1))) out[pair.slice(0, i)] = pair.slice(i + 1)
  }
  return out
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

/** A day trip's placed day (picked or default) and the other days it could move to; null for a road trip or when nothing fits. */
export function placedDay(stay: Stay, r: Pick<TripRoute, 'id' | 'days' | 'duration'>, picks: Readonly<Record<string, string>>): { day: string; others: string[] } | null {
  if (r.days > 1) return null
  const day = tripStartFor(stay, r, picks)
  return day ? { day, others: dayTripOptions(stay, r.duration).filter((d) => d !== day) } : null
}

/** The days a trip takes inside the stay, from its start; empty when it does not fit. */
export function tripDays(stay: Stay, r: Pick<TripRoute, 'id' | 'days' | 'duration'>, picks: Readonly<Record<string, string>>): string[] {
  const from = tripStartFor(stay, r, picks)
  return from ? Array.from({ length: r.days }, (_, i) => addDays(from, i)) : []
}

/** The other plan trips that run in the same hours on one of this trip's days. */
export function tripClashes<R extends Pick<TripRoute, 'id' | 'days' | 'duration'>>(stay: Stay, r: R, others: readonly R[], picks: Readonly<Record<string, string>>): R[] {
  const mine = tripDays(stay, r, picks)
  const [a0, a1] = TRIP_HOURS[r.duration]
  return others.filter((o) => {
    const [b0, b1] = TRIP_HOURS[o.duration]
    return o.id !== r.id && a0 < b1 && b0 < a1 && tripDays(stay, o, picks).some((d) => mine.includes(d))
  })
}

/** The nights of the stay spent at a hotel here (not away on a kept road trip), live from this browser's kept trips and picks. */
/** What a hotel here gets booked for: the nights slept here, the nights away, and the stay the links open on. */
export type HereNights = { hereNights: number; away: string[]; bookStay: Stay | null }

/** The stay a hotel here is booked for: the nights not spent away when they form one block (a trip at the start or the end of the stay); the whole stay otherwise. */
export function hereStay(stay: Stay, away: readonly string[]): Stay {
  if (away.length === 0) return stay
  const here: string[] = []
  for (let d = stay.checkIn; d < stay.checkOut; d = addDays(d, 1)) if (!away.includes(d)) here.push(d)
  if (here.length === 0) return stay
  const contiguous = here.every((d, i) => i === 0 || d === addDays(here[i - 1], 1))
  return contiguous ? { ...stay, checkIn: here[0], checkOut: addDays(here[here.length - 1], 1) } : stay
}

export function useHereNights(stay: Stay | null, trips: readonly TripNights[], plan?: { ids: readonly string[]; picks: Readonly<Record<string, string>> }): HereNights {
  const ownKept = useKeptTrips()
  const ownPicks = useTripStartPicks()
  // A shared plan (sent trips with their days) counts instead of this browser's own list.
  const kept = plan?.ids ?? ownKept
  const picks = plan?.picks ?? ownPicks
  // Memoised so a map effect keyed on the result does not rebuild on every render.
  return useMemo(() => {
    if (!stay) return { hereNights: 0, away: [], bookStay: null }
    const away = awayNights(stay, trips.map((r) => ({ ...r, stops: r.nightsAway.map((day) => ({ kind: 'hotel' as const, day })) })), kept, picks)
    return { hereNights: nights(stay) - away.length, away, bookStay: hereStay(stay, away) }
  }, [stay, trips, kept, picks])
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
