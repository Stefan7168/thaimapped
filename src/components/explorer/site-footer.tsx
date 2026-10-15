import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'

export function SiteFooter({ locale }: { locale: Locale }) {
  const s = strings(locale)
  return (
    <footer className="border-t border-line px-4 py-4 text-xs text-ink-2">
      <p>{s.footer.data}</p>
      <p>{s.footer.affiliate}</p>
    </footer>
  )
}
