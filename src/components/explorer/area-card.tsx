'use client'

import Link from 'next/link'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Area, Locale, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'

/**
 * One area in the left column: its photographs to click through, the line
 * and the fits, and a toggle that opens the longer text, the parts of the
 * area and its stations. The whole head is the "show on the map" action.
 */
export function AreaCard({ locale, area, stations, onPick, onPickSubarea, onPickStation }: { locale: Locale; area: Area; stations: Station[]; onPick: (id: string) => void; onPickSubarea: (areaId: string, subId: string) => void; onPickStation: (id: string) => void }) {
  const s = strings(locale)
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState(0)
  const name = t(area.name, locale)
  const photos = area.photos ?? []
  const n = photos.length
  const current = photos[photo]
  const step = (d: number) => setPhoto((i) => (i + d + n) % n)
  const panelId = `tm-area-more-${area.id}`

  return (
    <li className="tm-acard" style={{ ['--pin' as string]: `var(--${area.color})` }}>
      {n > 0 && current && (
        <div className="tm-acard__photos">
          <Image src={current.src} alt={current.alt} fill sizes="352px" className="tm-acard__img" />
          {n > 1 && (
            <>
              <button type="button" aria-label={s.guide.prevPhoto} onClick={() => step(-1)} className="tm-acard__arrow tm-acard__arrow--left">
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button type="button" aria-label={s.guide.nextPhoto} onClick={() => step(1)} className="tm-acard__arrow tm-acard__arrow--right">
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
              <span className="tm-acard__dots" aria-label={s.guide.photoOf(name, photo + 1, n)}>
                {photos.map((_, i) => (
                  <span key={i} className={`tm-acard__dot${i === photo ? ' tm-acard__dot--on' : ''}`} />
                ))}
              </span>
            </>
          )}
          <a className="tm-acard__credit" href={current.source} target="_blank" rel="noopener">{s.guide.photoCredit(current.credit, current.licence)}</a>
        </div>
      )}
      <button type="button" onClick={() => onPick(area.id)} className="tm-acard__head" aria-label={s.guide.show(name)}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{name}</span>
          <span className="shrink-0 text-xs text-ink-2">{s.guide.meta(area.stations.length, area.pins.length)}</span>
        </span>
        <span className="mt-0.5 block text-sm text-ink-2">{t(area.tagline, locale)}</span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          {area.fits.map((f) => (
            <span key={f} className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-medium text-ink">{s.guide.fits[f] ?? f}</span>
          ))}
        </span>
      </button>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className={`tm-acard__toggle${open ? ' tm-acard__toggle--on' : ''}`}>
        <span>{open ? s.guide.less : s.guide.more}</span>
        <ChevronDown aria-hidden="true" className="tm-acard__chevron size-4" />
      </button>
      <div id={panelId} className="tm-acard__more" hidden={!open}>
        {area.about && <p className="tm-acard__about">{t(area.about, locale)}</p>}
        <Link href={`/${locale}/${area.city}/area/${area.id}`} className="tm-weekend__share">{s.areaPage.link}</Link>
        <p className="tm-acard__label">{s.guide.subareas}</p>
        <ul className="tm-acard__list">
          {area.subareas.map((sub) => (
            <li key={sub.id}>
              <button type="button" className="tm-acard__chip" onClick={() => onPickSubarea(area.id, sub.id)}>{t(sub.name, locale)}</button>
            </li>
          ))}
        </ul>
        {stations.length > 0 && (
          <>
            <p className="tm-acard__label">{s.guide.stations}</p>
            <ul className="tm-acard__list">
              {stations.map((st) => (
                <li key={st.id}>
                  <button type="button" className="tm-acard__chip" onClick={() => onPickStation(st.id)}>{st.code ? `${st.code} ` : ''}{t(st.name, locale)}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </li>
  )
}
