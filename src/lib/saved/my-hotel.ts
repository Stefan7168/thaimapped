'use client'

import { useSyncExternalStore } from 'react'

/**
 * Which saved hotel an area's plan walks from, when more than one is saved:
 * kept per area in this browser. Pages read it live through `useMyHotelChoice`
 * and fall back to the first saved hotel when nothing is chosen.
 */
const PREFIX = 'tm.hotel.'
const EVENT = 'tm-hotel-choice'
let version = 0

function read(areaId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(PREFIX + areaId)
  } catch {
    return null
  }
}

/** The chosen hotel id for an area, read once (for code outside React, such as the map card). */
export function myHotelChoice(areaId: string): string | null {
  return read(areaId)
}

export function chooseHotel(areaId: string, hotelId: string) {
  try {
    window.localStorage.setItem(PREFIX + areaId, hotelId)
  } catch {
    // Nothing to do: the choice then lasts until the next page load.
  }
  version += 1
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

/** A number that changes with every choice: a component reading several areas' choices with `myHotelChoice` re-renders on it. */
export function useHotelChoiceVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0)
}

/** The chosen hotel id for an area, live; null on the server and until the page is live. */
export function useMyHotelChoice(areaId: string): string | null {
  return useSyncExternalStore(subscribe, () => read(areaId), () => null)
}
