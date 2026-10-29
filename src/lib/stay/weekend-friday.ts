import type { Stay } from './store'

function plusDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + days * 86400000)
  return d.toISOString().slice(0, 10)
}

/**
 * The Friday that starts the weekend inside a stay: the first Friday on or
 * after check-in whose Sunday is still inside the stay. A Friday-to-Sunday
 * stay gives its own Friday; a Thursday-to-Sunday or Friday-to-Monday stay
 * still has one; a Monday-to-Wednesday stay has none.
 */
export function weekendFriday(stay: Pick<Stay, 'checkIn' | 'checkOut'>): string | null {
  const weekday = new Date(stay.checkIn + 'T00:00:00').getDay()
  const friday = plusDays(stay.checkIn, (5 - weekday + 7) % 7)
  return plusDays(friday, 2) <= stay.checkOut ? friday : null
}

