import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { liveCityIds, loadCityBundle } from '@/lib/content/load'
import { stationPages } from '@/lib/explorer/stations'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'

export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => liveCityIds().map((city) => ({ locale, city })))
}

export async function generateMetadata(props: PageProps<'/[locale]/[city]/station'>): Promise<Metadata> {
  const { locale } = await props.params
  if (!isLocale(locale)) return {}
  const s = strings(locale)
  return { title: `${s.stationPage.indexTitle} · ${s.brand}` }
}

/** The stations with a page: grouped by line, in the order the lines are listed. */
export default async function StationIndex(props: PageProps<'/[locale]/[city]/station'>) {
  const { locale, city } = await props.params
  if (!isLocale(locale)) notFound()
  const bundle = loadCityBundle(city)
  if (!bundle) notFound()
  const s = strings(locale)
  const pages = stationPages(bundle)
  const byLine = bundle.lines.map((line) => ({ line, pages: pages.filter((p) => p.lines.some((l) => l.id === line.id)) })).filter((g) => g.pages.length > 0)
  return (
    <>
      <SiteHeader locale={locale} cityId={city} />
      <main className="tm-credits">
        <h1 className="tm-h2">{s.stationPage.indexTitle}</h1>
        <p className="tm-credits__lead">{s.stationPage.indexLead(pages.length)}</p>
        {byLine.map(({ line, pages }) => (
          <section key={line.id} className="tm-credits__group">
            <h2 className="tm-credits__area"><span className="tm-st__line" style={{ background: line.color }} aria-hidden="true" />{line.system} {line.line}</h2>
            <ul className="tm-st__index">
              {pages.map((p) => {
                const st = p.stations[0]
                return (
                  <li key={p.slug}>
                    <Link href={`/${locale}/${city}/station/${p.slug}`} className="tm-st__index-row">
                      <span className="tm-ui__code tm-st__code" style={{ background: line.color }}>{st.code}</span>
                      <span className="tm-st__index-name">{t(st.name, locale)}</span>
                      <span className="tm-st__index-meta">{s.stationPage.counts(p.hotels.length, p.places.length)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>
      <SiteFooter locale={locale} cityId={city} />
    </>
  )
}
