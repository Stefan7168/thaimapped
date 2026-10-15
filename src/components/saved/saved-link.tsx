'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { useSaved } from '@/lib/saved/store'

/** The way to the shortlist, with how many are on it once the page is live in the browser. */
export function SavedLink({ locale, className }: { locale: Locale; className: string }) {
  const s = strings(locale)
  const n = useSaved().length
  return (
    <Link href={`/${locale}/saved`} className={className} aria-label={n > 0 ? `${s.saved.nav} (${n})` : s.saved.nav}>
      <Heart aria-hidden="true" className="size-4" />
      <span>{s.saved.nav}</span>
      {n > 0 && <span className="tm-saved-link__count">{n}</span>}
    </Link>
  )
}
