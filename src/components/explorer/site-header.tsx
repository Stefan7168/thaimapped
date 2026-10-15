import Link from 'next/link'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { SavedLink } from '@/components/saved/saved-link'

/** A plain bar: wordmark, two links. No chrome. */
export function SiteHeader({ locale, cityId }: { locale: Locale; cityId: string }) {
  const s = strings(locale)
  return (
    <header className="tm-bar">
      <Link href={`/${locale}`} className="tm-wordmark">{s.brand}</Link>
      <nav className="tm-bar__links">
        <Link href={`/${locale}/${cityId}`} className="tm-link">{s.nav.map}</Link>
        <Link href={`/${locale}/${cityId}/trip`} className="tm-link">{s.nav.trips}</Link>
        <Link href={`/${locale}/${cityId}/station`} className="tm-link">{s.nav.stations}</Link>
        <SavedLink locale={locale} className="tm-link tm-saved-link" />
      </nav>
    </header>
  )
}
