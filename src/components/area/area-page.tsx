'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState, useSyncExternalStore } from 'react'
import type { Area, Locale, Pin, PinKind, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { distanceM, KIND_CHIPS, WALK_PACE_M_PER_MIN } from '@/lib/explorer/filters'
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
import { useSaved } from '@/lib/saved/store'
import { StayPicker } from '@/components/stay/stay-picker'
import { HotelCompare } from '@/components/stay/hotel-compare'
import { KIND_ICONS } from '@/components/explorer/kind-bar'

const StageMap = dynamic(() => import('@/components/map/stage-map').then((m) => m.StageMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper" />,
})

const noopSubscribe = () => () => {}

/**
 * One area as a page of its own: the pictures, what it is, who it fits, the
 * stations, the places by kind and the hotels, with the map at the side.
 * The same content the map's area card shows, laid out to be read and sent.
 */
export function AreaPage({ locale, cityId, area, areas, stations, stationSlugs }: { locale: Locale; cityId: string; area: Area; areas: Area[]; stations: Station[]; stationSlugs: Record<string, string> }) {
  const s = strings(locale)
  const stay = useStay()
  const detected3D = useSyncExternalStore(noopSubscribe, supports3D, () => null)
  const [card, setCard] = useState<{ pin: Pin; area: Area } | null>(null)
  const stationById = useMemo(() => new Map(stations.map((st) => [st.id, st])), [stations])
  const kinds = useMemo(() => {
    const order: PinKind[] = [...(KIND_CHIPS.filter((k) => k !== 'hotel') as PinKind[]), 'transport']
    return order.map((kind) => ({ kind, pins: area.pins.filter((p) => p.kind === kind) })).filter((g) => g.pins.length > 0)
  }, [area])
  const hotels = useMemo(() => area.pins.filter((p) => p.kind === 'hotel'), [area])
  // The hotel the reader hearted in this area: every place then says how far it is from that door.
  const saved = useSaved()
  const myHotel = useMemo(() => hotels.find((h) => saved.includes(h.id)) ?? null, [hotels, saved])
  const fromHotel = (pin: Pin) => (myHotel ? Math.max(1, Math.round(distanceM(myHotel.location.lon, myHotel.location.lat, pin.location.lon, pin.location.lat) / WALK_PACE_M_PER_MIN)) : null)
  const pinned = useMemo(() => [...kinds.flatMap((g) => g.pins), ...hotels], [kinds, hotels])
  // Places (not hotels) of this area inside a ten-minute walk of a hotel, straight-line at walking pace.
  const nearbyCount = (hotel: Pin) => area.pins.filter((p) => p.kind !== 'hotel' && distanceM(hotel.location.lon, hotel.location.lat, p.location.lon, p.location.lat) <= WALK_PACE_M_PER_MIN * 10).length
  const areaStations = area.stations.map((id) => stationById.get(id)).filter((st): st is Station => !!st)
  const photos = area.photos ?? []
  const explorerHref = `/${locale}/${cityId}#area=${area.id}`
  const weekendHref = `/${locale}/${cityId}/weekend/${area.id}`

  // On a phone the map is a sticky band above the text: a tapped place brings it back into view.
  const showMap = () => {
    if (window.innerWidth > 1023) return
    const stage = document.querySelector('.tm-stage')
    if (stage) window.scrollTo({ top: window.scrollY + stage.getBoundingClientRect().top, behavior: 'smooth' })
  }

  const row = (pin: Pin) => {
    const n = pinned.findIndex((p) => p.id === pin.id) + 1
    const photo = pin.photos?.[0] ?? pin.photo
    const KindIcon = KIND_ICONS[pin.kind]
    const walkStation = pin.walk ? stationById.get(pin.walk.station) : undefined
    const on = card?.pin.id === pin.id
    const partners = pin.kind === 'hotel' ? (Object.keys(pin.links) as Partner[]) : []
    return (
      <li key={pin.id} className="tm-wk__item">
        <SaveButton id={pin.id} locale={locale} className="tm-wk__save" />
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
            {pin.price && stay && <span className="tm-wk__meta tm-wk__stay">{s.guide.stayTotal(thb(pin.price.from * nights(stay), locale), nights(stay))}</span>}
            {pin.walk && walkStation && <span className="tm-wk__meta">{s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${walkStation.code ? walkStation.code + ' ' : ''}${t(walkStation.name, locale)}`)}</span>}
            {pin.kind !== 'hotel' && myHotel && <span className="tm-wk__meta tm-wk__from">{s.weekendPage.fromHotel(fromHotel(pin)!, t(myHotel.name, locale))}</span>}
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

  const others = areas.filter((a) => a.id !== area.id)
  return (
    <>
      <SiteHeader locale={locale} cityId={cityId} />
      <main className="tm-stage tm-wk tm-ar" style={{ ['--pin' as string]: `var(--${area.color})` }}>
        <div className="tm-sheet tm-wk__sheet">
          <p className="tm-wk__eyebrow">{area.fits.map((f) => s.guide.fits[f] ?? f).join(' · ')}</p>
          <h1 className="tm-h2">{t(area.name, locale)}</h1>
          <p className="tm-wk__lead">{t(area.tagline, locale)}</p>
          {photos.length > 0 && (
            <ul className="tm-ar__photos" aria-label={s.areaPage.photos}>
              {photos.slice(0, 3).map((photo, i) => (
                <li key={photo.src} className="tm-ar__photo">
                  <Image src={photo.src} alt={photo.alt} width={480} height={360} sizes="(min-width: 1024px) 220px, (max-width: 480px) 45vw, 30vw" priority={i === 0} />
                  <span className="tm-ar__credit">{photo.credit}</span>
                </li>
              ))}
            </ul>
          )}
          {area.about && <p className="tm-ar__about">{t(area.about, locale)}</p>}
          <div className="tm-wk__actions">
            <Link href={weekendHref} className="tm-button tm-button--small">{s.areaPage.weekend}</Link>
            <Link href={explorerHref} className="tm-link">{s.weekendPage.openMap}</Link>
          </div>
          {areaStations.length > 0 && (
            <section className="tm-ar__section">
              <h2 className="tm-wk__time">{s.guide.stations}</h2>
              <p className="tm-wk__empty">{s.areaPage.stationsLead}</p>
              <ul className="tm-wk__other-list">
                {areaStations.map((st) => {
                  const label = `${st.code ? st.code + ' ' : ''}${t(st.name, locale)}`
                  const slug = stationSlugs[st.id]
                  return (
                    <li key={st.id}>
                      <Link href={slug ? `/${locale}/${cityId}/station/${slug}` : `/${locale}/${cityId}#station=${st.id}`} className="tm-weekend__stop">
                        <span aria-hidden="true" className="tm-wk__dot" />
                        {label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          {area.subareas.length > 0 && (
            <section className="tm-ar__section">
              <h2 className="tm-wk__time">{s.guide.subareas}</h2>
              <p className="tm-ar__parts">{area.subareas.map((sub) => t(sub.name, locale)).join(' · ')}</p>
            </section>
          )}
          <ol className="tm-wk__slots">
            {kinds.map(({ kind, pins }) => (
              <li key={kind} className="tm-wk__slot">
                <h2 className="tm-wk__time">{s.pin[kind]}</h2>
                <ul className="tm-wk__stops">{pins.map(row)}</ul>
              </li>
            ))}
            <li className="tm-wk__slot tm-wk__slot--stay">
              <h2 className="tm-wk__time">{s.guide.stay}</h2>
              {hotels.length > 0 && <StayPicker locale={locale} />}
              {hotels.length > 0 && <p className={myHotel ? 'tm-wk__empty' : 'tm-wk__empty tm-wk__hint'}>{myHotel ? s.weekendPage.hotelPicked(t(myHotel.name, locale)) : s.weekendPage.pickHotelHint}</p>}
              {hotels.length === 0 ? <p className="tm-wk__empty">{s.guide.stayNone}</p> : <ul className="tm-wk__stops">{hotels.map(row)}</ul>}
              {hotels.length > 1 && (
                <div className="tm-ar__cmp">
                  <h3 className="tm-wk__time">{s.areaPage.compare}</h3>
                  <p className="tm-saved__note">{s.areaPage.compareLead}</p>
                  <HotelCompare locale={locale} cityId={cityId} entries={hotels.map((pin) => ({ pin, area }))} stations={stations} nearbyCount={nearbyCount} showArea={false} />
                </div>
              )}
            </li>
          </ol>
          <section className="tm-wk__others">
            <h2 className="tm-wk__time">{s.areaPage.others}</h2>
            <ul className="tm-wk__other-list">
              {others.map((a) => (
                <li key={a.id}>
                  <Link href={`/${locale}/${cityId}/area/${a.id}`} className="tm-weekend__stop" style={{ ['--pin' as string]: `var(--${a.color})` }}>
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
