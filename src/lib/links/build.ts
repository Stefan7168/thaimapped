import { env } from '@/lib/env'
import type { PinLinks } from '@/lib/content/types'
import { nights, roomsOf, type Stay } from '@/lib/stay/store'

/**
 * Outbound link builder. Content stores plain destination URLs; the
 * affiliate wrapper and sub-ID are added here at render time, so changing
 * networks is one function and never a content migration.
 *
 * Sub-ID shape: `{page}.{pin}` for our own pages, `{creator}.{pin}` for
 * creator pages, so every click is attributable to a page and a pin.
 */
export type Partner = keyof PinLinks

// Travelpayouts program ids (trs = traffic source, p = program). Placeholders until
// the account exists; with an empty marker the builder returns the plain URL.
const TP_PROGRAM: Partial<Record<Partner, { trs: string; p: string }>> = {
  agoda: { trs: '', p: '' },
  booking: { trs: '', p: '' },
}

/**
 * Adds the visitor's dates to a hotel page so it opens priced for the stay.
 * Booking's names (checkin, checkout, group_adults, no_rooms) are read off a
 * live hotel URL; Agoda's (checkIn, checkOut, los, adults, rooms) are the
 * usual ones but not yet checked on a live page. Unknown names are ignored by
 * the site, so the worst case is a page priced for tonight, as before.
 */
export function withStay(partner: Partner, destination: string, stay: Stay | null): string {
  if (!stay || (partner !== 'agoda' && partner !== 'booking')) return destination
  let u: URL
  try {
    u = new URL(destination)
  } catch {
    return destination
  }
  if (partner === 'agoda') {
    u.searchParams.set('checkIn', stay.checkIn)
    u.searchParams.set('checkOut', stay.checkOut)
    u.searchParams.set('los', String(nights(stay)))
    u.searchParams.set('adults', String(stay.adults ?? 2))
    u.searchParams.set('rooms', String(roomsOf(stay)))
  } else {
    u.searchParams.set('checkin', stay.checkIn)
    u.searchParams.set('checkout', stay.checkOut)
    u.searchParams.set('group_adults', String(stay.adults ?? 2))
    u.searchParams.set('no_rooms', String(roomsOf(stay)))
  }
  return u.toString()
}

export function buildOutboundUrl(partner: Partner, destination: string, subId: string, stay: Stay | null = null): string {
  destination = withStay(partner, destination, stay)
  const marker = env.travelpayoutsMarker
  const program = TP_PROGRAM[partner]
  if (!marker || !program || !program.p) return destination
  const u = new URL('https://tp.media/r')
  u.searchParams.set('marker', marker)
  u.searchParams.set('trs', program.trs)
  u.searchParams.set('p', program.p)
  u.searchParams.set('u', destination)
  u.searchParams.set('sub_id', subId)
  return u.toString()
}

/**
 * A plain hotel search on a partner for a town or area, used where a trip
 * sleeps somewhere not yet picked. Both sites take a free-text place and the
 * dates ride along through withStay. Neither URL shape is checked on a live
 * page yet; an unknown parameter is ignored and the search still opens.
 */
export function hotelSearchUrl(partner: 'agoda' | 'booking', place: string, subId: string, stay: Stay | null = null): string {
  const u = partner === 'agoda' ? new URL('https://www.agoda.com/search') : new URL('https://www.booking.com/searchresults.html')
  u.searchParams.set(partner === 'agoda' ? 'textToSearch' : 'ss', place)
  return buildOutboundUrl(partner, u.toString(), subId, stay)
}

export function subIdFor(page: string, pin: string): string {
  return `${page}.${pin}`.replace(/[^a-z0-9._-]/gi, '-').slice(0, 64)
}
