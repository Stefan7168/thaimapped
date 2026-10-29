'use client'

import { useEffect, useState } from 'react'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { MAX_ADULTS, MAX_CHILDREN, adultsOf, childrenOf, clearStay, nextWeekend, nights, roomsOf, setAdults, setChildren, setStay, shiftStay, todayIso, type Stay, useStay } from '@/lib/stay/store'

/**
 * Check-in and check-out, kept in this browser. Every booking link on the
 * site carries the dates once they are set, so the hotel page opens priced
 * for the stay. "This weekend" fills the coming Friday to Sunday. `bare`
 * drops the control's own label where the surrounding section carries one.
 */
export function StayPicker({ locale, bare = false }: { locale: Locale; bare?: boolean }) {
  const s = strings(locale)
  const stay = useStay()
  // The server does not know the visitor's day; the date floor is set once the page is live.
  const [today, setToday] = useState('')
  const [weekend, setWeekend] = useState<Stay | null>(null)
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setToday(todayIso())
      setWeekend(nextWeekend())
    })
    return () => window.cancelAnimationFrame(id)
  }, [])
  const isWeekend = !!weekend && stay?.checkIn === weekend.checkIn && stay?.checkOut === weekend.checkOut
  // The weekend after: for people who plan a week ahead.
  const after = weekend ? shiftStay(weekend, 7) : null
  const isAfter = !!after && stay?.checkIn === after.checkIn && stay?.checkOut === after.checkOut
  // One tap turns the weekend into a long one, or back: the check-out moves a day.
  const moveOut = (days: number) => {
    if (!stay) return
    const d = new Date(stay.checkOut + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setStay(stay.checkIn, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  const onChange = (which: 'in' | 'out', value: string) => {
    const checkIn = which === 'in' ? value : (stay?.checkIn ?? '')
    const checkOut = which === 'out' ? value : (stay?.checkOut ?? '')
    if (which === 'in' && value && (!checkOut || checkOut <= value)) {
      // One date is enough to start: two nights from it until the visitor says otherwise.
      const d = new Date(value + 'T00:00:00')
      d.setDate(d.getDate() + 2)
      setStay(value, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      return
    }
    setStay(checkIn, checkOut)
  }
  return (
    <div className={`tm-stay${bare ? ' tm-stay--bare' : ''}`} role="group" aria-label={s.stay.label}>
      {!bare && <span className="tm-stay__label">{s.stay.label}</span>}
      <span className="tm-stay__dates">
        <input type="date" value={stay?.checkIn ?? ''} min={today} onChange={(e) => onChange('in', e.target.value)} aria-label={s.stay.checkIn} />
        <span className="tm-stay__to" aria-hidden="true">→</span>
        <input type="date" value={stay?.checkOut ?? ''} min={stay?.checkIn ?? today} onChange={(e) => onChange('out', e.target.value)} aria-label={s.stay.checkOut} />
      </span>
      <button type="button" className={`tm-chip${isWeekend ? ' tm-chip--on' : ''}`} disabled={!weekend} onClick={() => weekend && setStay(weekend.checkIn, weekend.checkOut)}>
        {s.stay.thisWeekend}
      </button>
      <button type="button" className={`tm-chip${isAfter ? ' tm-chip--on' : ''}`} disabled={!after} onClick={() => after && setStay(after.checkIn, after.checkOut)}>
        {s.stay.nextWeekend}
      </button>
      {stay && (
        <span className="tm-stay__tail">
          <span className="tm-stay__nights">{s.stay.nights(nights(stay))}</span>
          <button type="button" className="tm-stay__clear" onClick={() => moveOut(1)} aria-label={`${s.stay.addNight} (${s.stay.nights(nights(stay) + 1)})`}>{s.stay.addNight}</button>
          {nights(stay) > 1 && <button type="button" className="tm-stay__clear" onClick={() => moveOut(-1)} aria-label={`${s.stay.dropNight} (${s.stay.nights(nights(stay) - 1)})`}>{s.stay.dropNight}</button>}
          <span className="tm-stay__nights">{s.stay.adults(adultsOf(stay), roomsOf(stay), childrenOf(stay))}</span>
          {adultsOf(stay) < MAX_ADULTS && <button type="button" className="tm-stay__clear" onClick={() => setAdults(adultsOf(stay) + 1)} aria-label={`${s.stay.addAdult} (${s.stay.adults(adultsOf(stay) + 1)})`}>{s.stay.addAdult}</button>}
          {adultsOf(stay) > 1 && <button type="button" className="tm-stay__clear" onClick={() => setAdults(adultsOf(stay) - 1)} aria-label={`${s.stay.dropAdult} (${s.stay.adults(adultsOf(stay) - 1)})`}>{s.stay.dropAdult}</button>}
          {childrenOf(stay) < MAX_CHILDREN && <button type="button" className="tm-stay__clear" onClick={() => setChildren(childrenOf(stay) + 1)} aria-label={`${s.stay.addChild} (${s.stay.adults(adultsOf(stay), 1, childrenOf(stay) + 1)})`}>{s.stay.addChild}</button>}
          {childrenOf(stay) > 0 && <button type="button" className="tm-stay__clear" onClick={() => setChildren(childrenOf(stay) - 1)} aria-label={`${s.stay.dropChild} (${s.stay.adults(adultsOf(stay), 1, childrenOf(stay) - 1)})`}>{s.stay.dropChild}</button>}
          {childrenOf(stay) > 0 && <span className="tm-stay__nights">{s.stay.childAges}</span>}
          <button type="button" className="tm-stay__clear" onClick={clearStay}>{s.stay.clear}</button>
        </span>
      )}
    </div>
  )
}
