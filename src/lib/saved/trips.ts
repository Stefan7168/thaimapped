import { useSyncExternalStore } from 'react'

/**
 * The trips the visitor kept, kept in this browser only (localStorage,
 * no account), beside the hotel and place shortlist in `./store.ts`.
 * Ids are route ids (content/routes/*.json).
 */
const KEY = 'tm.trips.v1'
const EVENT = 'tm-trips'
const EMPTY: readonly string[] = []

let cacheRaw: string | null = null
let cache: readonly string[] = EMPTY

function read(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === cacheRaw) return cache
    cacheRaw = raw
    const parsed: unknown = raw ? JSON.parse(raw) : []
    cache = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : EMPTY
  } catch {
    // Private windows and blocked storage: the list is empty and keeping does nothing.
  }
  return cache
}

function write(ids: readonly string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // Nothing to do: the page keeps working without a list.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function toggleKeptTrip(id: string) {
  const cur = read()
  write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
}

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** The kept trip ids, live; empty on the server and until the page is live in the browser. */
export function useKeptTrips(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}
