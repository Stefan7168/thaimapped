import Link from 'next/link'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'

export function SiteHeader({ locale }: { locale: Locale }) {
  const s = strings(locale)
  return (
    <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-3">
      <Link href={`/${locale}`} className="font-display text-xl font-semibold tracking-tight">
        {s.brand}
      </Link>
      <nav className="text-sm text-ink-2">
        <Link href={`/${locale}`}>{s.nav.cities}</Link>
      </nav>
    </header>
  )
}
