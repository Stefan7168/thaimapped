'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'

/**
 * The scroll box around a side-by-side table. On a narrow screen the
 * right-hand columns run off the edge, so the box shows a fade on the side
 * that has more and a one-line hint until the reader has scrolled.
 */
export function CmpWrap({ locale, children }: { locale: Locale; children: ReactNode }) {
  const s = strings(locale)
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState<'' | 'right' | 'left' | 'both'>('')
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth
      if (max <= 1) return setMore('')
      const l = el.scrollLeft > 1
      const r = el.scrollLeft < max - 1
      setMore(l && r ? 'both' : l ? 'left' : r ? 'right' : '')
      if (l) setMoved(true)
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', measure); ro.disconnect() }
  }, [])
  return (
    <>
      <div ref={ref} className="tm-cmp__wrap" data-more={more || undefined}>{children}</div>
      {more === 'right' && !moved && <p className="tm-cmp__hint" aria-hidden="true">{s.saved.cmpSwipe}</p>}
    </>
  )
}
