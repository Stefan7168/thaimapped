import { useSyncExternalStore } from 'react'

/**
 * Stops the visitor took out of a weekend plan ("Not this one"), kept in
 * this browser only. The plan refills the slot from the area's other
 * places; a skipped stop can be put back from the line above the plan.
 */
const KEY = 'tm.skip.v1'
const EVENT = 'tm-skipped'
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
    // Private windows and blocked storage: nothing is skipped and skipping does nothing.
  }
  return cache
}

function write(ids: readonly string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // Nothing to do.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function skippedIds(): readonly string[] {
  return read()
}

export function skipStop(id: string) {
  const cur = read()
  if (!cur.includes(id)) write([...cur, id])
}

export function unskipStops(ids: readonly string[]) {
  write(read().filter((x) => !ids.includes(x)))
}

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** The skipped ids, live; empty on the server and until the page is live in the browser. */
export function useSkipped(): readonly string[] {
  return useSyncExternalStore(subscribe, skippedIds, () => EMPTY)
}
