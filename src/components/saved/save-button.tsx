'use client'

import { Heart } from 'lucide-react'
import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { toggleSaved, useSaved } from '@/lib/saved/store'

/** The heart on a hotel: saves it to the shortlist in this browser. Sits beside a card, never inside its button. */
export function SaveButton({ id, locale, className = '' }: { id: string; locale: Locale; className?: string }) {
  const s = strings(locale)
  const on = useSaved().includes(id)
  return (
    <button type="button" aria-pressed={on} aria-label={on ? s.saved.remove : s.saved.save} title={on ? s.saved.remove : s.saved.save} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSaved(id) }} className={`tm-save${on ? ' tm-save--on' : ''} ${className}`}>
      <Heart aria-hidden="true" className="size-4" />
    </button>
  )
}
