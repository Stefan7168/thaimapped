'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState, useSyncExternalStore } from 'react'
import type { Area, Locale, Pin, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import type { StationPage as StationPageData, StationPin } from '@/lib/explorer/stations'
import { whenLine } from '@/lib/explorer/when'
import { thb } from '@/lib/explorer/price'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { directionsUrl } from '@/lib/links/directions'
import { nights, useStay } from '@/lib/stay/store'
import { trackOutbound } from '@/lib/links/track'
import { supports3D } from '@/lib/map/device'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'
import { SaveButton } from '@/components/saved/save-button'
import { StayPicker } from '@/components/stay/stay-picker'
import { KIND_ICONS } from '@/components/explorer/kind-bar'

const StageMap = dynamic(() => import('@/components/map/stage-map').then((m) => m.StageMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper" />,
})

const noopSubscribe = () => () => {}

/**
 * One station's page: the hotels and places inside a ten-minute walk of it,
 * nearest first, with the station itself marked on the map at the side.
 * "hotels near Asok" is how people search; this is the page that answers.
 */
export function StationPage({ locale, cityId, page, areas, stations, others }: { locale: Locale; cityId: string; page: StationPageData; areas: Area[]; stations: Station[]; others: StationPageData[] }) {
  const s = strings(locale)
  const stay = useStay()
  const detected3D = useSyncExternalStore(noopSubscribe, supports3D, () => null)
  const st = page.stations[0]
  const label = `${st.code ? st.code + ' ' : ''}${t(st.name, locale)}`
  const [card, setCard] = useState<{ pin: Pin; area: Area } | null>(null)
  const pinned = useMemo(() => [...page.hotels, ...page.places], [page])
  // The map takes one area for its colour: the area most of the nearby pins belong to.
  const mainArea = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of pinned) counts.set(n.area.id, (counts.get(n.area.id) ?? 0) + 1)
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return areas.find((a) => a.id === best) ?? areas[0]
  }, [pinned, areas])
  // The areas the nearby places belong to, most first: each links to its area page.
  const areasNear = useMemo(() => {
    const counts = new Map<string, { area: Area; n: number }>()
    for (const { area } of pinned) counts.set(area.id, { area, n: (counts.get(area.id)?.n ?? 0) + 1 })
    return [...counts.values()].sort((a, b) => b.n - a.n).map((x) => x.area)
  }, [pinned])
  const camera = useMemo(() => ({ center: [st.lon, st.lat] as [number, number], zoom: 15, pitch: 0, bearing: 0 }), [st])
  const explorerHref = `/${locale}/${cityId}#station=${st.id}`

  const showMap = () => {
    if (window.innerWidth > 1023) return
    const stage = document.querySelector('.tm-stage')
    if (stage) window.scrollTo({ top: window.scrollY + stage.getBoundingClientRect().top, behavior: 'smooth' })
  }

  const row = ({ pin, area, minutes, estimated }: StationPin) => {
    const n = pinned.findIndex((p) => p.pin.id === pin.id) + 1
    const photo = pin.photos?.[0] ?? pin.photo
    const KindIcon = KIND_ICONS[pin.kind]
    const on = card?.pin.id === pin.id
    const partners = pin.kind === 'hotel' ? (Object.keys(pin.links) as Partner[]) : []
    return (
      <li key={pin.id} className="tm-wk__item">
        {<SaveButton id={pin.id} locale={locale} className="tm-wk__save" />}
        <button type="button" aria-pressed={on} onClick={() => { setCard(on ? null : { pin, area }); if (!on) showMap() }} className={`tm-wk__stop${on ? ' tm-wk__stop--on' : ''}`} style={{ ['--pin' as string]: `var(--${area.color})` }}>
          {photo ? (
            <Image src={photo.src} alt="" width={72} height={72} sizes="72px" className="tm-wk__thumb" />
          ) : (
            <span aria-hidden="true" className="tm-wk__thumb tm-wk__thumb--empty"><KindIcon className="size-6" /></span>
          )}
          <span className="tm-wk__text">
            <span className="tm-wk__kind"><span className="tm-wk__num">{n}</span> {pin.kind === 'hotel' && pin.tier ? s.filters.tier[pin.tier] : s.pin[pin.kind]} · {t(area.name, locale)}</span>
            <span className="tm-wk__name">{t(pin.name, locale)}</span>
            <span className="tm-wk__why">{t(pin.why, locale)}</span>
            {whenLine(pin, locale) && <span className="tm-wk__when">{whenLine(pin, locale)}</span>}
            {pin.price && <span className="tm-wk__meta">{s.guide.priceFrom(thb(pin.price.from, locale))}{pin.price.basis === 'tier-estimate' ? ` (${s.guide.priceEstimate})` : ''}</span>}
            {pin.price && stay && <span className="tm-wk__meta tm-wk__stay">{s.guide.stayTotal(thb(pin.price.from * nights(stay), locale), nights(stay))}</span>}
            <span className="tm-wk__meta">{s.city.walkMinutes(minutes)} {s.city.from(label)}{estimated ? ` (${s.stationPage.estimated})` : ''}</span>
          </span>
        </button>
        <div className="tm-wk__links">
          <a href={directionsUrl(pin.location.lat, pin.location.lon)} target="_blank" rel="noopener" className="tm-card__link tm-card__link--quiet">{s.card.directions}</a>
            {partners.map((p) => {
              const subId = subIdFor(`${cityId}-${area.id}`, pin.id)
              return (
                <a key={p} href={buildOutboundUrl(p, pin.links[p]!, subId, stay)} onClick={() => p !== 'official' && trackOutbound(p, subId)} target="_blank" rel={p === 'official' ? 'noopener' : 'noopener sponsored'} className={p === 'official' ? 'tm-card__link tm-card__link--quiet' : 'tm-card__link'}>
                  {p === 'official' ? s.card.official : s.card.open(p.charAt(0).toUpperCase() + p.slice(1))}
                </a>
              )
            })}
        </div>
      </li>
    )
  }

  return (
    <>
      <SiteHeader locale={locale} cityId={cityId} />
      <main className="tm-stage tm-wk" style={{ ['--pin' as string]: page.lines[0]?.color ?? 'var(--accent)' }}>
        <div className="tm-sheet tm-wk__sheet">
          <p className="tm-wk__eyebrow tm-wk__eyebrow--lines">
            {page.lines.map((l) => (
              <span key={l.id} className="tm-st__badge" style={{ ['--lc' as string]: l.color }}>{l.system} {l.line}</span>
            ))}
          </p>
          <h1 className="tm-h2">{s.stationPage.title(label)}</h1>
          <p className="tm-wk__lead">{s.stationPage.lead(page.hotels.length, page.places.length)}</p>
          <ol className="tm-wk__slots">
            <li className="tm-wk__slot">
              <h2 className="tm-wk__time">{s.stationPage.hotels}</h2>
              {page.hotels.length > 0 && <StayPicker locale={locale} />}
              {page.hotels.length === 0 ? <p className="tm-wk__empty">{s.stationPage.noHotels}</p> : <ul className="tm-wk__stops">{page.hotels.map(row)}</ul>}
            </li>
            <li className="tm-wk__slot">
              <h2 className="tm-wk__time">{s.stationPage.places}</h2>
              {page.places.length === 0 ? <p className="tm-wk__empty">{s.stationPage.noPlaces}</p> : <ul className="tm-wk__stops">{page.places.map(row)}</ul>}
            </li>
          </ol>
          {areasNear.length > 0 && (
            <section className="tm-wk__others">
              <h2 className="tm-wk__time">{s.stationPage.areasNear(label)}</h2>
              <ul className="tm-wk__other-list">
                {areasNear.map((a) => (
                  <li key={a.id}>
                    <Link href={`/${locale}/${cityId}/area/${a.id}`} className="tm-weekend__stop">
                      <span aria-hidden="true" className="tm-st__line" style={{ background: `var(--${a.color})` }} />
                      {t(a.name, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="tm-wk__others">
            <h2 className="tm-wk__time">{s.stationPage.others}</h2>
            <ul className="tm-wk__other-list">
              {others.map((p) => (
                <li key={p.slug}>
                  <Link href={`/${locale}/${cityId}/station/${p.slug}`} className="tm-weekend__stop">
                    <span className="tm-ui__code tm-st__code" style={{ ['--lc' as string]: p.lines[0]?.color }}>{p.stations[0].code}</span>
                    {t(p.stations[0].name, locale)}
                  </Link>
                </li>
              ))}
              <li><Link href={`/${locale}/${cityId}/station`} className="tm-weekend__stop">{s.stationPage.all}</Link></li>
            </ul>
          </section>
          <SiteFooter locale={locale} cityId={cityId} compact />
        </div>
        <div className="tm-stage__map" data-ui>
          {detected3D !== null && (
            <StageMap locale={locale} camera={camera} threeD={detected3D} areas={[]} route={null} focus={{ pins: pinned.map((n) => n.pin), area: mainArea, numbered: true }} marker={{ lon: st.lon, lat: st.lat, label, color: page.lines[0]?.color ?? '#c8553d' }} card={card} onCloseCard={() => setCard(null)} cityId={cityId} stations={stations} />
          )}
          <div className="tm-stage__bar" data-map-overlay="bottom">
            <span className="tm-stage__showing">{s.home.showing(label)}</span>
            <Link href={explorerHref} className="tm-link">{s.weekendPage.openMap}</Link>
          </div>
        </div>
      </main>
    </>
  )
}
