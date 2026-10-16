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

/** The area whose hotel the whole weekend sleeps in (the last area a hotel was chosen in); null until a choice is made. */
export function myHomeArea(): string | null {
  return read('city')
}

export function chooseHotel(areaId: string, hotelId: string) {
  try {
    window.localStorage.setItem(PREFIX + areaId, hotelId)
    window.localStorage.setItem(PREFIX + 'city', areaId)
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

/**
 * The one saved hotel the city-wide pages (home, trips, "you sleep elsewhere") treat as yours when hotels are saved in
 * several areas: the chosen hotel of the home area, else the most recently saved hotel (its area's chosen one, if any).
 * Read once per render; re-run on `useHotelChoiceVersion` and on the saved list.
 */
export function myHotelAcross<H extends { id: string }>(hotelsByArea: Record<string, H[]>, saved: readonly string[], skipArea?: string): { areaId: string; hotel: H } | null {
  const pick = (areaId: string): { areaId: string; hotel: H } | null => {
    if (areaId === skipArea) return null
    const mine = (hotelsByArea[areaId] ?? []).filter((h) => saved.includes(h.id))
    if (mine.length === 0) return null
    return { areaId, hotel: mine.find((h) => h.id === read(areaId)) ?? mine[0] }
  }
  const home = myHomeArea()
  const fromHome = home ? pick(home) : null
  if (fromHome) return fromHome
  for (let i = saved.length - 1; i >= 0; i--) {
    const areaId = Object.keys(hotelsByArea).find((a) => hotelsByArea[a].some((h) => h.id === saved[i]))
    const found = areaId ? pick(areaId) : null
    if (found) return found
  }
  return null
}

/** A number that changes with every choice: a component reading several areas' choices with `myHotelChoice` re-renders on it. */
export function useHotelChoiceVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0)
}

/** The chosen hotel id for an area, live; null on the server and until the page is live. */
export function useMyHotelChoice(areaId: string): string | null {
  return useSyncExternalStore(subscribe, () => read(areaId), () => null)
}
