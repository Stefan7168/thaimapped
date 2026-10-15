'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Share2 } from 'lucide-react'
import type { Area, Locale, Pin, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { isFullRange, PRICE_RANGE, type PriceRange } from '@/lib/explorer/filters'
import { WEEKEND_SLOTS, weekendPlan } from '@/lib/explorer/weekend'
import { whenLine } from '@/lib/explorer/when'
import { thb } from '@/lib/explorer/price'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { trackOutbound } from '@/lib/links/track'
import { supports3D } from '@/lib/map/device'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'
import { KIND_ICONS } from '@/components/explorer/kind-bar'

const StageMap = dynamic(() => import('@/components/map/stage-map').then((m) => m.StageMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper" />,
})

const noopSubscribe = () => () => {}

/** `?price=min-max` from the address bar, clamped to the slider's range; null when absent or the full range. */
function readPrice(): PriceRange | null {
  const m = new URLSearchParams(window.location.search).get('price')?.match(/^(\d+)-(\d+)$/)
  if (!m) return null
  const r = { min: Math.max(PRICE_RANGE.min, Number(m[1])), max: Math.min(PRICE_RANGE.max, Number(m[2])) }
  return r.min < r.max && !isFullRange(r) ? r : null
}

/**
 * One area's weekend as a page of its own: the plan from Friday night to
 * Sunday, the hotels inside the budget, the same map at the side, and a
 * link anyone can share. The page is static; the budget rides in the URL.
 */
export function WeekendPage({ locale, cityId, area, areas, stations }: { locale: Locale; cityId: string; area: Area; areas: Area[]; stations: Station[] }) {
  const s = strings(locale)
  const detected3D = useSyncExternalStore(noopSubscribe, supports3D, () => null)
  const [price, setPrice] = useState<PriceRange | null>(null)
  // The address is not known on the server; read it once the page is live.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setPrice(readPrice()))
    return () => window.cancelAnimationFrame(id)
  }, [])
  const plan = useMemo(() => weekendPlan(area, price), [area, price])
  const [card, setCard] = useState<{ pin: Pin; area: Area } | null>(null)
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle')
  const stationById = useMemo(() => new Map(stations.map((st) => [st.id, st])), [stations])
  const stops = useMemo(() => WEEKEND_SLOTS.flatMap((slot) => plan.slots[slot]), [plan])
  const pinned = useMemo(() => [...stops, ...plan.hotels], [stops, plan.hotels])
  const priceQuery = price ? `price=${price.min}-${price.max}` : ''
  const explorerHref = `/${locale}/${cityId}#area=${area.id}${priceQuery ? `&${priceQuery}` : ''}`

  const share = async () => {
    const url = window.location.href
    const title = s.weekendPage.title(t(area.name, locale))
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared('copied')
    } catch {
      setShared('failed')
    }
    window.setTimeout(() => setShared('idle'), 2500)
  }

  const stop = (pin: Pin) => {
    const n = pinned.findIndex((p) => p.id === pin.id) + 1
    const photo = pin.photos?.[0] ?? pin.photo
    const KindIcon = KIND_ICONS[pin.kind]
    const walkStation = pin.walk ? stationById.get(pin.walk.station) : undefined
    const on = card?.pin.id === pin.id
    return (
      <li key={pin.id}>
        <button type="button" aria-pressed={on} onClick={() => { setCard(on ? null : { pin, area }); if (!on) showMap() }} className={`tm-wk__stop${on ? ' tm-wk__stop--on' : ''}`}>
          {photo ? (
            <Image src={photo.src} alt="" width={72} height={72} sizes="72px" className="tm-wk__thumb" />
          ) : (
            <span aria-hidden="true" className="tm-wk__thumb tm-wk__thumb--empty"><KindIcon className="size-6" /></span>
          )}
          <span className="tm-wk__text">
            <span className="tm-wk__kind"><span className="tm-wk__num">{n}</span> {pin.kind === 'hotel' && pin.tier ? s.filters.tier[pin.tier] : s.pin[pin.kind]}</span>
            <span className="tm-wk__name">{t(pin.name, locale)}</span>
            <span className="tm-wk__why">{t(pin.why, locale)}</span>
            {whenLine(pin, locale) && <span className="tm-wk__when">{whenLine(pin, locale)}</span>}
            {pin.price && <span className="tm-wk__meta">{s.guide.priceFrom(thb(pin.price.from, locale))}{pin.price.basis === 'tier-estimate' ? ` (${s.guide.priceEstimate})` : ''}</span>}
            {pin.walk && walkStation && <span className="tm-wk__meta">{s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${walkStation.code ? walkStation.code + ' ' : ''}${t(walkStation.name, locale)}`)}</span>}
          </span>
        </button>
        {pin.kind === 'hotel' && (Object.keys(pin.links) as Partner[]).length > 0 && (
          <div className="tm-wk__links">
            {(Object.keys(pin.links) as Partner[]).map((p) => {
              const subId = subIdFor(`${cityId}-${area.id}`, pin.id)
              return (
                <a key={p} href={buildOutboundUrl(p, pin.links[p]!, subId)} onClick={() => p !== 'official' && trackOutbound(p, subId)} target="_blank" rel={p === 'official' ? 'noopener' : 'noopener sponsored'} className={p === 'official' ? 'tm-card__link tm-card__link--quiet' : 'tm-card__link'}>
                  {p === 'official' ? s.card.official : s.card.open(p.charAt(0).toUpperCase() + p.slice(1))}
                </a>
              )
            })}
          </div>
        )}
      </li>
    )
  }

  // On a phone the map is a sticky band above the text: a tapped stop brings it back into view.
  const showMap = () => {
    if (window.innerWidth > 1023) return
    const stage = document.querySelector('.tm-stage')
    if (stage) window.scrollTo({ top: window.scrollY + stage.getBoundingClientRect().top, behavior: 'smooth' })
  }

  const others = areas.filter((a) => a.id !== area.id)
  return (
    <>
      <SiteHeader locale={locale} cityId={cityId} />
      <main className="tm-stage tm-wk" style={{ ['--pin' as string]: `var(--${area.color})` }}>
        <div className="tm-sheet tm-wk__sheet">
          <p className="tm-wk__eyebrow">{s.weekendPage.eyebrow}</p>
          <h1 className="tm-h2">{s.weekendPage.title(t(area.name, locale))}</h1>
          <p className="tm-wk__lead">{t(area.tagline, locale)} {price ? s.weekendPage.budget(thb(price.min, locale), thb(price.max, locale)) : s.weekendPage.anyBudget}</p>
          <div className="tm-wk__actions">
            <button type="button" onClick={share} className="tm-button">
              <Share2 aria-hidden="true" className="size-4" />
              {shared === 'copied' ? s.weekendPage.copied : shared === 'failed' ? s.weekendPage.copyFailed : s.weekendPage.share}
            </button>
            <Link href={explorerHref} className="tm-link">{s.weekendPage.openMap}</Link>
          </div>
          <ol className="tm-wk__slots">
            {WEEKEND_SLOTS.map((slot) => (
              <li key={slot} className="tm-wk__slot">
                <h2 className="tm-wk__time">{s.guide.slots[slot]}</h2>
                {plan.slots[slot].length === 0 ? <p className="tm-wk__empty">{s.guide.slotEmpty}</p> : <ul className="tm-wk__stops">{plan.slots[slot].map(stop)}</ul>}
              </li>
            ))}
            <li className="tm-wk__slot tm-wk__slot--stay">
              <h2 className="tm-wk__time">{s.guide.stay}</h2>
              {plan.hotels.length === 0 ? <p className="tm-wk__empty">{s.guide.stayNone}</p> : <ul className="tm-wk__stops">{plan.hotels.map(stop)}</ul>}
            </li>
          </ol>
          <section className="tm-wk__others">
            <h2 className="tm-wk__time">{s.weekendPage.others}</h2>
            <ul className="tm-wk__other-list">
              {others.map((a) => (
                <li key={a.id}>
                  <Link href={`/${locale}/${cityId}/weekend/${a.id}${priceQuery ? `?${priceQuery}` : ''}`} className="tm-weekend__stop" style={{ ['--pin' as string]: `var(--${a.color})` }}>
                    <span aria-hidden="true" className="tm-wk__dot" />
                    {t(a.name, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <SiteFooter locale={locale} cityId={cityId} compact />
        </div>
        <div className="tm-stage__map" data-ui>
          {detected3D !== null && (
            <StageMap locale={locale} camera={area.camera} threeD={detected3D} areas={[area]} route={null} focus={{ pins: pinned, area, numbered: true }} card={card} onCloseCard={() => setCard(null)} cityId={cityId} stations={stations} />
          )}
          <div className="tm-stage__bar" data-map-overlay="bottom">
            <span className="tm-stage__showing">{s.home.showing(t(area.name, locale))}</span>
            <Link href={explorerHref} className="tm-link">{s.weekendPage.openMap}</Link>
          </div>
        </div>
      </main>
    </>
  )
}
