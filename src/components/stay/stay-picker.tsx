'use client'

import { useEffect, useState } from 'react'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { clearStay, nextWeekend, nights, setStay, todayIso, useStay, type Stay } from '@/lib/stay/store'

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
      {stay && (
        <>
          <span className="tm-stay__nights">{s.stay.nights(nights(stay))}</span>
          <button type="button" className="tm-stay__clear" onClick={clearStay}>{s.stay.clear}</button>
        </>
      )}
    </div>
  )
}
