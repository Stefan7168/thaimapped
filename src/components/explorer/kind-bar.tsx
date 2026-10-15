'use client'

import type { Locale, PinKind } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { PIN_KINDS, type FilterState } from '@/lib/explorer/filters'

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

/** The second bar under the header: what to show, as chips. Scrolls sideways on phones. */
export function KindBar({ locale, filters, onChange }: { locale: Locale; filters: FilterState; onChange: (next: FilterState) => void }) {
  const s = strings(locale)
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-line bg-paper px-3 py-2 md:px-4">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2">{s.filters.kinds}</span>
      {PIN_KINDS.map((k: PinKind) => {
        const on = filters.kinds.includes(k)
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => onChange({ ...filters, kinds: toggle(filters.kinds, k) })} className={`min-h-9 shrink-0 rounded-full border px-3 text-sm ${on ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
            {s.pin[k]}
          </button>
        )
      })}
    </div>
  )
}
