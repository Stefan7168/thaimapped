import Link from 'next/link'
import { strings } from '@/lib/i18n/strings'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import { stationPages } from '@/lib/explorer/stations'
import { t } from '@/lib/i18n/locales'
import { NotFoundHints, type NotFoundCity } from '@/components/explorer/not-found-hints'

/** The 404 page, in the site's own voice; English, as the only locale so far. */
export default function NotFound() {
  const s = strings('en')
  const cities: NotFoundCity[] = liveCityIds().flatMap((id) => {
    const bundle = loadCityBundle(id)
    if (!bundle) return []
    return [{
      id,
      name: t(bundle.city.name, 'en'),
      areas: bundle.areas.map((a) => ({ href: `/en/${id}/area/${a.id}`, name: t(a.name, 'en') })),
      stations: stationPages(bundle).map((p) => ({ href: `/en/${id}/station/${p.slug}`, name: `${p.stations[0].code ? p.stations[0].code + ' ' : ''}${t(p.stations[0].name, 'en')}` })).sort((a, b) => a.name.localeCompare(b.name)),
      trips: loadRoutes(id).map((r) => ({ href: `/en/${id}/trip/${r.id}`, name: t(r.name, 'en') })),
    }]
  })
  return (
    <main className="tm-nf">
      <Link href="/en" className="tm-wordmark">{s.brand}</Link>
      <h1 className="tm-h2">{s.notFound.title}</h1>
      <p>{s.notFound.lead}</p>
      <Link href="/en/bangkok" className="tm-button">{s.notFound.action}</Link>
      <NotFoundHints cities={cities} />
    </main>
  )
}
