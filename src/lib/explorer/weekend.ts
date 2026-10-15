import type { Area, Pin, TimeOfDay } from '@/lib/content/types'
import type { Tier } from './filters'

export const WEEKEND_SLOTS = ['fridayNight', 'saturdayMorning', 'saturdayAfternoon', 'saturdayNight', 'sunday'] as const
export type WeekendSlot = (typeof WEEKEND_SLOTS)[number]

export interface WeekendPlan {
  slots: Record<WeekendSlot, Pin[]>
  /** The area's hotels, in the chosen budget if one is set. */
  hotels: Pin[]
}

const SLOT_TIMES: Record<WeekendSlot, TimeOfDay[]> = {
  fridayNight: ['evening', 'night'],
  saturdayMorning: ['morning'],
  saturdayAfternoon: ['afternoon'],
  saturdayNight: ['evening', 'night'],
  sunday: ['morning', 'afternoon'],
}

const PER_SLOT = 2

/**
 * Builds a Friday night to Sunday plan from the area's own places and their
 * `when` data. Each place is used once. First pass: a place goes to the slot
 * that covers at least half of its times (so a morning-and-afternoon temple
 * lands in the daytime, not on Friday night). Second pass: any remaining
 * overlap fills the gaps. Weekend-only places are kept for Sunday; a place
 * with no `when` goes to Saturday afternoon. A slot with nothing stays empty.
 */
export function weekendPlan(area: Area, tier: Tier | null = null): WeekendPlan {
  const places = area.pins.filter((p) => p.kind !== 'hotel')
  const used = new Set<string>()
  const slots: Record<WeekendSlot, Pin[]> = { fridayNight: [], saturdayMorning: [], saturdayAfternoon: [], saturdayNight: [], sunday: [] }
  const weekendOnly = (p: Pin) => Boolean(p.when?.days && !p.when.days.includes('weekday'))
  const fit = (p: Pin, slot: WeekendSlot) => (p.when ? p.when.times.filter((x) => SLOT_TIMES[slot].includes(x)).length / p.when.times.length : 0)
  const fill = (slot: WeekendSlot, ok: (p: Pin) => boolean) => {
    for (const p of places) {
      if (slots[slot].length >= PER_SLOT) break
      if (used.has(p.id) || !ok(p)) continue
      used.add(p.id)
      slots[slot].push(p)
    }
  }
  fill('sunday', (p) => weekendOnly(p) && fit(p, 'sunday') > 0)
  const nightSlots: WeekendSlot[] = ['fridayNight', 'saturdayNight']
  for (const slot of WEEKEND_SLOTS) fill(slot, (p) => !weekendOnly(p) && fit(p, slot) >= 0.5 && (!nightSlots.includes(slot) || !p.when?.times.includes('morning')))
  fill('saturdayAfternoon', (p) => !p.when)
  for (const slot of WEEKEND_SLOTS) fill(slot, (p) => fit(p, slot) > 0)
  const hotels = area.pins.filter((p) => p.kind === 'hotel' && (!tier || p.tier === tier))
  return { slots, hotels }
}
