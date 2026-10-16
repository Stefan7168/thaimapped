'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Locale, RouteDuration, RouteMode, RouteTheme, TripRoute } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { RevealObserver } from '@/components/motion/reveal'
import { addDays, nights, tripStartDefault, useStay } from '@/lib/stay/store'
import { formatDayRange } from '@/lib/stay/format'

const StageMap = dynamic(() => import('@/components/map/stage-map').then((m) => m.StageMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper" />,
})

const DURATIONS: RouteDuration[] = ['morning', 'afternoon', 'evening', 'full-day', 'multi-day']
const DAY_BUCKETS = ['1', '2', '3', '4+'] as const
const MODES: RouteMode[] = ['car', 'scooter', 'transit', 'walk', 'boat']
const THEMES: RouteTheme[] = ['culture', 'nature', 'food', 'city', 'beach', 'nightlife']

type DayBucket = (typeof DAY_BUCKETS)[number]

interface TripFilters {
  durations: RouteDuration[]
  days: DayBucket[]
  modes: RouteMode[]
  themes: RouteTheme[]
}

const EMPTY: TripFilters = { durations: [], days: [], modes: [], themes: [] }

function bucketOf(days: number): DayBucket {
  return days >= 4 ? '4+' : (String(days) as DayBucket)
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

/**
 * The trips index: a sticky map at the left draws whichever trip is active;
 * the list at the right holds the trips as rows, with the chip filters above.
 * Hover, focus, tap or scrolling a row to the middle makes it active.
 */
export function TripList({ locale, cityId, cityCamera, routes }: { locale: Locale; cityId: string; cityCamera: { center: [number, number]; zoom: number; pitch: number; bearing: number }; routes: TripRoute[] }) {
  const s = strings(locale)
  const [f, setF] = useState<TripFilters>(EMPTY)
  // Phones: the four chip rows fold behind one button, closed until tapped, so the trips come first.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const rowsRef = useRef<Map<string, HTMLElement>>(new Map())
  // While the pointer is over the list, the hovered row leads and the scroll
  // observer stays quiet: opening a row shifts the rows below it, and the
  // observer would otherwise answer that shift by picking a different one.
  const hoveringRef = useRef(false)
  // With dates set, a multi-day trip says whether it fits inside them (a two-day trip in a Fri to Sun stay) or needs more nights; day trips always fit and say nothing.
  const stay = useStay()
  const fitTag = (r: TripRoute) => {
    if (!stay || r.days < 2) return null
    if (r.days > nights(stay) + 1) return s.trip.tooLong(nights(stay))
    const from = tripStartDefault(stay, r.days)
    return `${s.trip.fitsStay(nights(stay))} · ${formatDayRange(from, addDays(from, r.days - 1), locale)}`
  }
  const count = f.durations.length + f.days.length + f.modes.length + f.themes.length

  // Only offer chips that at least one trip would satisfy, so no filter is a dead end.
  const available = useMemo(
    () => ({
      durations: new Set(routes.map((r) => r.duration)),
      days: new Set(routes.map((r) => bucketOf(r.days))),
      modes: new Set(routes.map((r) => r.mode)),
      themes: new Set(routes.flatMap((r) => r.themes)),
    }),
    [routes],
  )

  const shown = useMemo(
    () =>
      routes.filter(
        (r) =>
          (f.durations.length === 0 || f.durations.includes(r.duration)) &&
          (f.days.length === 0 || f.days.includes(bucketOf(r.days))) &&
          (f.modes.length === 0 || f.modes.includes(r.mode)) &&
          (f.themes.length === 0 || r.themes.some((th) => f.themes.includes(th))),
      ),
    [routes, f],
  )

  const active = shown.find((r) => r.id === activeId) ?? null

  // The row nearest the middle of the screen is the active trip.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !hoveringRef.current) setActiveId((e.target as HTMLElement).dataset.trip ?? null)
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    rowsRef.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [shown])

  const setRow = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) rowsRef.current.set(id, el)
    else rowsRef.current.delete(id)
  }, [])

  const chip = (on: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} className={`tm-chip${on ? ' tm-chip--on' : ''}`}>
      {label}
    </button>
  )

  return (
    <div className="tm-trips-index">
      <RevealObserver />
      <div className="tm-trips-index__map" data-ui>
        <StageMap locale={locale} camera={cityCamera} threeD={false} areas={[]} route={active} routes={routes} />
      </div>
      <div className="tm-trips-index__list">
        <h1 className="tm-h2" data-rise>{s.trip.heading}</h1>
        <p className="tm-trips-index__intro" data-rise style={{ ['--i' as string]: 1 }}>{s.trip.intro}</p>
        <div className={`tm-filters${filtersOpen ? '' : ' tm-filters--closed'}`} data-rise style={{ ['--i' as string]: 2 }}>
          <button type="button" className={`tm-chip tm-filters__toggle${count > 0 ? ' tm-chip--on' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
            {count > 0 ? s.trip.filters.showCount(count) : s.trip.filters.show}
          </button>
          <Row label={s.trip.filters.duration}>
            {DURATIONS.filter((d) => available.durations.has(d)).map((d) => chip(f.durations.includes(d), s.trip.duration[d], () => setF({ ...f, durations: toggle(f.durations, d) }), d))}
          </Row>
          <Row label={s.trip.filters.days}>
            {DAY_BUCKETS.filter((d) => available.days.has(d)).map((d) => chip(f.days.includes(d), s.trip.dayCount[d], () => setF({ ...f, days: toggle(f.days, d) }), d))}
          </Row>
          <Row label={s.trip.filters.mode}>
            {MODES.filter((m) => available.modes.has(m)).map((m) => chip(f.modes.includes(m), s.trip.mode[m], () => setF({ ...f, modes: toggle(f.modes, m) }), m))}
          </Row>
          <Row label={s.trip.filters.theme}>
            {THEMES.filter((th) => available.themes.has(th)).map((th) => chip(f.themes.includes(th), s.trip.theme[th], () => setF({ ...f, themes: toggle(f.themes, th) }), th))}
          </Row>
          <p className="tm-filters__count">
            <span>{s.trip.filters.count(shown.length)}</span>
            {count > 0 && (
              <button type="button" onClick={() => setF(EMPTY)} className="tm-link tm-link--under">
                {s.trip.filters.clear}
              </button>
            )}
          </p>
        </div>
        {shown.length === 0 && <p className="tm-trips-index__none">{s.trip.filters.none}</p>}
        <ul className="tm-rows" onMouseEnter={() => { hoveringRef.current = true }} onMouseLeave={() => { hoveringRef.current = false }}>
          {shown.map((r, i) => {
            const on = r.id === activeId
            return (
              <li key={r.id} ref={setRow(r.id)} data-trip={r.id} className={`tm-row${on ? ' tm-row--on' : ''}`}>
                <div data-rise style={{ ['--i' as string]: i + 3 }}>
                <button type="button" className="tm-row__head" aria-expanded={on} onMouseEnter={() => setActiveId(r.id)} onFocus={() => setActiveId(r.id)} onClick={() => setActiveId(r.id)}>
                  <span className="tm-row__name">{t(r.name, locale)}</span>
                  <span className="tm-row__meta">
                    {r.duration === 'multi-day' ? s.trip.days(r.days) : s.trip.duration[r.duration]}
                    {` · ${s.trip.mode[r.mode].toLowerCase()}`}
                    {r.distanceKm !== undefined ? ` · ${s.trip.km(r.distanceKm)}` : ''}
                  </span>
                  <span className="tm-row__tag">{t(r.tagline, locale)}</span>
                  {fitTag(r) && <span className="tm-row__fit">{fitTag(r)}</span>}
                </button>
                <div className="tm-row__body" hidden={!on}>
                  <p>
                    {r.themes.map((th) => s.trip.theme[th]).join(', ')}.
                  </p>
                  <Link href={`/${locale}/${cityId}/trip/${r.id}`} className="tm-button tm-button--small">{s.trip.open}</Link>
                </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tm-filters__row">
      <span className="tm-filters__label">{label}</span>
      {children}
    </div>
  )
}
