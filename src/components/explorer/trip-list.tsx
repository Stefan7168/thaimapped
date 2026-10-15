'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { Locale, RouteDuration, RouteMode, RouteTheme, TripRoute } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'

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

/** Trip cards with chip filters: how long, how many days, how, what for. */
export function TripList({ locale, cityId, routes }: { locale: Locale; cityId: string; routes: TripRoute[] }) {
  const s = strings(locale)
  const [f, setF] = useState<TripFilters>(EMPTY)
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

  const chip = (on: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
      {label}
    </button>
  )

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-paper-2/60 p-3">
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
        <div className="flex items-center justify-between text-xs text-ink-2">
          <span>{s.trip.filters.count(shown.length)}</span>
          {count > 0 && (
            <button type="button" onClick={() => setF(EMPTY)} className="font-medium text-accent underline underline-offset-2">
              {s.trip.filters.clear}
            </button>
          )}
        </div>
      </div>
      {shown.length === 0 && <p className="mt-6 text-ink-2">{s.trip.filters.none}</p>}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border border-line bg-white/60 p-5">
            <h2 className="font-display text-2xl">{t(r.name, locale)}</h2>
            <p className="mt-1 text-ink-2">{t(r.tagline, locale)}</p>
            <p className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-2">
              <span className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.duration[r.duration]}</span>
              {r.duration === 'multi-day' && <span className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.days(r.days)}</span>}
              <span className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.mode[r.mode]}</span>
              {r.distanceKm !== undefined && <span className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.km(r.distanceKm)}</span>}
              {r.themes.map((th) => (
                <span key={th} className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.theme[th]}</span>
              ))}
            </p>
            <Link href={`/${locale}/${cityId}/trip/${r.id}`} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
              {s.country.explore}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-full text-[11px] font-semibold uppercase tracking-wider text-ink-2 sm:w-20">{label}</span>
      {children}
    </div>
  )
}
