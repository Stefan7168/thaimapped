import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { pageMeta } from '@/lib/seo/page-meta'
import Image from 'next/image'
import { liveCityIds, loadCityBundle } from '@/lib/content/load'
import type { AreaPhoto, Locale } from '@/lib/content/types'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'

export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata(props: PageProps<'/[locale]/credits'>): Promise<Metadata> {
  const { locale } = await props.params
  if (!isLocale(locale)) return {}
  const s = strings(locale)
  return pageMeta({ locale, title: s.credits.title, path: `/${locale}/credits` })
}

interface Credit {
  photo: AreaPhoto
  /** Where the picture is used: the area, or a place in it. */
  subject: string
}

/** Every photograph on the site, once per file, grouped by area, in the order the content lists them. */
function collectCredits(locale: Locale) {
  const groups: { area: string; credits: Credit[] }[] = []
  for (const cityId of liveCityIds()) {
    const bundle = loadCityBundle(cityId)
    if (!bundle) continue
    for (const area of bundle.areas) {
      const seen = new Set<string>()
      const credits: Credit[] = []
      const add = (photo: AreaPhoto, subject: string) => {
        if (seen.has(photo.src)) return
        seen.add(photo.src)
        credits.push({ photo, subject })
      }
      for (const photo of area.photos ?? []) add(photo, t(area.name, locale))
      for (const pin of area.pins) {
        if (pin.photo) add(pin.photo, t(pin.name, locale))
        for (const photo of pin.photos ?? []) add(photo, t(pin.name, locale))
      }
      if (credits.length > 0) groups.push({ area: t(area.name, locale), credits })
    }
  }
  return groups
}

/** The credits page: who took every picture on the site and under which licence, as those licences ask. */
export default async function CreditsPage(props: PageProps<'/[locale]/credits'>) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()
  const s = strings(locale)
  const groups = collectCredits(locale)
  const total = groups.reduce((n, g) => n + g.credits.length, 0)
  const cityId = liveCityIds()[0]
  return (
    <>
      <SiteHeader locale={locale} cityId={cityId} />
      <main className="tm-credits">
        <h1 className="tm-h2">{s.credits.title}</h1>
        <p className="tm-credits__lead">{s.credits.lead(total)}</p>
        {groups.map((g) => (
          <section key={g.area} className="tm-credits__group">
            <h2 className="tm-credits__area">{g.area}</h2>
            <ul className="tm-credits__list">
              {g.credits.map(({ photo, subject }) => (
                <li key={photo.src} className="tm-credits__item">
                  <Image src={photo.src} alt="" width={96} height={64} sizes="96px" className="tm-credits__thumb" />
                  <div className="tm-credits__text">
                    <p className="tm-credits__subject">{subject}</p>
                    <p>
                      <a href={photo.source} target="_blank" rel="noopener" className="tm-link">{photo.credit}</a>
                      {' · '}
                      {photo.licence}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="tm-credits__note">{s.footer.data}</p>
      </main>
      <SiteFooter locale={locale} cityId={cityId} />
    </>
  )
}
