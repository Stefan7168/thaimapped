'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { useSaved } from '@/lib/saved/store'
import { useKeptTrips } from '@/lib/saved/trips'

/** The way to the shortlist, with how many are on it once the page is live in the browser. */
export function SavedLink({ locale, className }: { locale: Locale; className: string }) {
  const s = strings(locale)
  // Hotels and places plus kept trips: everything the saved page lists.
  const n = useSaved().length + useKeptTrips().length
  return (
    <Link href={`/${locale}/saved`} className={className}>
      <Heart aria-hidden="true" className="size-4" />
      <span>{s.saved.nav}</span>
      {n > 0 && <span className="tm-saved-link__count" aria-label={`${n} ${s.saved.nav.toLowerCase()}`}>{n}</span>}
    </Link>
  )
}
