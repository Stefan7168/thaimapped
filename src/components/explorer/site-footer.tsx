import Link from 'next/link'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { SavedLink } from '@/components/saved/saved-link'

/**
 * One quiet line: the data credit at the left, the links in the centre, the
 * year and the commission note at the right. Compact stacks it, for panels.
 */
export function SiteFooter({ locale, cityId, compact = false }: { locale: Locale; cityId?: string; compact?: boolean }) {
  const s = strings(locale)
  return (
    <footer className={`tm-footer${compact ? ' tm-footer--compact' : ''}`}>
      <p>{s.footer.data}</p>
      {cityId && (
        <nav className="tm-footer__links">
          <Link href={`/${locale}/${cityId}`} className="tm-link">{s.nav.map}</Link>
          <Link href={`/${locale}/${cityId}/trip`} className="tm-link">{s.nav.trips}</Link>
          <Link href={`/${locale}/${cityId}/station`} className="tm-link">{s.nav.stations}</Link>
          <Link href={`/${locale}/credits`} className="tm-link">{s.nav.credits}</Link>
          <SavedLink locale={locale} className="tm-link tm-saved-link" />
        </nav>
      )}
      <p className="tm-footer__right">{s.footer.year} · {s.footer.affiliate}</p>
    </footer>
  )
}
