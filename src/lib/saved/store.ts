import { useSyncExternalStore } from 'react'

/**
 * The shortlist: pin ids the visitor saved, kept in this browser only
 * (localStorage, no account). Ids are unique across the city's areas
 * (checked by scripts/validate-content.mjs through the content's ids).
 */
const KEY = 'tm.saved.v1'
const EVENT = 'tm-saved'
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
    // Private windows and blocked storage: the list is empty and saving does nothing.
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

export function savedIds(): readonly string[] {
  return read()
}

export function toggleSaved(id: string) {
  const cur = read()
  write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
}

export function addSaved(ids: readonly string[]) {
  const cur = read()
  write([...cur, ...ids.filter((id) => !cur.includes(id))])
}

export function clearSaved() {
  write([])
}

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** The saved ids, live; empty on the server and until the page is live in the browser. */
export function useSaved(): readonly string[] {
  return useSyncExternalStore(subscribe, savedIds, () => EMPTY)
}
