'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { strings } from '@/lib/i18n/strings'

export interface NotFoundCity {
  id: string
  name: string
  areas: { href: string; name: string }[]
  stations: { href: string; name: string }[]
  trips: { href: string; name: string }[]
}

/** A missing area, station or trip address lists the real ones of that city, so a typo or an old link still lands somewhere useful. */
export function NotFoundHints({ cities }: { cities: NotFoundCity[] }) {
  const s = strings('en')
  const path = usePathname() ?? ''
  const m = path.match(/^\/[a-z]{2}\/([a-z0-9-]+)\/(area|station|trip)\//)
  const city = cities.find((c) => c.id === (m?.[1] ?? cities[0]?.id))
  if (!city) return null
  const kind = (m?.[2] ?? 'area') as 'area' | 'station' | 'trip'
  const list = kind === 'station' ? city.stations : kind === 'trip' ? city.trips : city.areas
  if (list.length === 0) return null
  return (
    <section className="tm-nf__hints">
      <h2 className="tm-credits__area">{s.notFound.hints[kind](city.name)}</h2>
      <ul className="tm-nf__list">
        {list.map((item) => (
          <li key={item.href}><Link href={item.href} className="tm-chip">{item.name}</Link></li>
        ))}
      </ul>
    </section>
  )
}
