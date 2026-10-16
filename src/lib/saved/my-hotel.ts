'use client'

import { useSyncExternalStore } from 'react'

/**
 * Which saved hotel an area's plan walks from, when more than one is saved:
 * kept per area in this browser. Pages read it live through `useMyHotelChoice`
 * and fall back to the first saved hotel when nothing is chosen.
 */
const PREFIX = 'tm.hotel.'
const EVENT = 'tm-hotel-choice'

function read(areaId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(PREFIX + areaId)
  } catch {
    return null
  }
}

export function chooseHotel(areaId: string, hotelId: string) {
  try {
    window.localStorage.setItem(PREFIX + areaId, hotelId)
  } catch {
    // Nothing to do: the choice then lasts until the next page load.
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

/** The chosen hotel id for an area, live; null on the server and until the page is live. */
export function useMyHotelChoice(areaId: string): string | null {
  return useSyncExternalStore(subscribe, () => read(areaId), () => null)
}
