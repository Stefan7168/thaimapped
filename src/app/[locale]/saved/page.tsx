import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import { LOCALES, isLocale } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { pageMeta } from '@/lib/seo/page-meta'
import { airportRoutesFor } from '@/lib/transit/from-airport'
import { SavedPage, type SavedEntry, type SavedTrip } from '@/components/saved/saved-page'

// Static shell; which hotels show is read in the browser (this browser's list, or ?ids= from a sent link).
export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata(props: PageProps<'/[locale]/saved'>): Promise<Metadata> {
  const { locale } = await props.params
  if (!isLocale(locale)) return {}
  const s = strings(locale)
  // A personal list: not for search engines.
  return { ...pageMeta({ locale, title: s.saved.title, description: s.saved.description, path: `/${locale}/saved` }), robots: { index: false } }
}

export default async function SavedRoute(props: PageProps<'/[locale]/saved'>) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()
  const cityId = liveCityIds()[0]
  const bundle = cityId ? loadCityBundle(cityId) : null
  if (!bundle) notFound()
  // Every hotel and place, with only what the row shows: no outlines, no street shapes, one photo.
  const entries: SavedEntry[] = bundle.areas.flatMap((a) =>
    a.pins.map((pin) => ({ pin: { ...pin, photos: pin.photos?.slice(0, 1), shape: undefined }, area: { id: a.id, name: a.name, color: a.color } })),
  )
  // Every trip, with only what its row shows; which ones show is this browser's kept list.
  const trips: SavedTrip[] = loadRoutes(bundle.city.id).map((r) => ({ id: r.id, name: r.name, tagline: r.tagline, mode: r.mode, duration: r.duration, days: r.days, distanceKm: r.distanceKm, nightsAway: r.stops.filter((st) => st.kind === 'hotel').map((st) => st.day), beds: r.stops.filter((st) => st.kind === 'hotel').map((st) => ({ day: st.day, name: st.name, why: st.why, search: st.search, location: st.location })) }))
  // Every station and interchange (29 KB): the page is static and only the browser knows which hotel a saved place is reached from, so the train route is worked out there.
  return <SavedPage locale={locale} cityId={bundle.city.id} entries={entries} trips={trips} stations={bundle.stations} interchanges={bundle.interchanges} airport={airportRoutesFor(bundle, [...new Set(entries.map((e) => e.pin).filter((p) => p.kind === 'hotel' && p.walk).map((p) => p.walk!.station))])} />
}
