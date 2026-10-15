import { env } from '@/lib/env'
import type { PinLinks } from '@/lib/content/types'

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

export function buildOutboundUrl(partner: Partner, destination: string, subId: string): string {
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

export function subIdFor(page: string, pin: string): string {
  return `${page}.${pin}`.replace(/[^a-z0-9._-]/gi, '-').slice(0, 64)
}
