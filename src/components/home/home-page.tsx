'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Area, Camera, CityBundle, Locale, Pin, TripRoute } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { supports3D } from '@/lib/map/device'
import { RevealObserver } from '@/components/motion/reveal'
import { SiteFooter } from '@/components/explorer/site-footer'
import { HotelFragment, StationFragment, TripStopsFragment } from './ui-fragments'
import { TRIP_COLORS, TripsDrawing } from './trips-drawing'

const StageMap = dynamic(() => import('@/components/map/stage-map').then((m) => m.StageMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper" />,
})

function noopSubscribe() {
  return () => {}
}

/**
 * The split stage: the live paper map holds the right half and never scrolls;
 * the left half reads like a sheet. As the areas pass the middle of the screen
 * the map flies to each one.
 */
export function HomePage({ locale, bundle, routes }: { locale: Locale; bundle: CityBundle; routes: TripRoute[] }) {
  const s = strings(locale)
  const { city, areas, stations, lines } = bundle
  const detected3D = useSyncExternalStore(noopSubscribe, supports3D, () => null)
  const threeD = detected3D ?? false
  const [activeArea, setActiveArea] = useState<string | null>(null)
  // The highlight the reader tapped open.
  const [cardPin, setCardPin] = useState<{ pin: Pin; area: Area } | null>(null)
  const rowsRef = useRef<Map<string, HTMLElement>>(new Map())
  // While the pointer is over the list, the hovered row leads and the scroll
  // observer stays quiet: opening a row shifts the rows below it, and the
  // observer would otherwise answer that shift by picking a different one.
  const hoveringRef = useRef(false)

  const cityCamera: Camera = threeD ? city.camera : city.camera2d
  const active = areas.find((a) => a.id === activeArea) ?? null
  const camera = active ? active.camera : cityCamera
  const cityName = t(city.name, locale)

  // The row nearest the middle of the screen is the active area.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || hoveringRef.current) continue
          setActiveArea((e.target as HTMLElement).dataset.area ?? null)
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    rowsRef.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Every highlight of the area in view (or of the tapped card's area) is pinned at once.
  const focusArea = useMemo(() => {
    const area = cardPin?.area ?? areas.find((a) => a.id === activeArea)
    return area ? { area, pins: area.pins.filter((p) => p.kind !== 'hotel').slice(0, 5) } : null
  }, [areas, activeArea, cardPin])

  const setRow = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) rowsRef.current.set(id, el)
    else rowsRef.current.delete(id)
  }, [])

  // Real content for the interface fragments.
  const fragments = useMemo(() => {
    const byId = new Map(stations.map((st) => [st.id, st]))
    const asok = byId.get('bts-sukhumvit-e4') ?? stations[0]
    const sameLine = stations.filter((st) => st.system === asok.system && st.line === asok.line)
    const at = Math.max(0, sameLine.findIndex((st) => st.id === asok.id))
    const stationRows = sameLine.slice(Math.max(0, at - 1), at + 3)
    let hotel: Pin | null = null
    let hotelArea = areas[0]
    for (const a of areas) {
      const h = a.pins.find((p) => p.kind === 'hotel' && p.walk)
      if (h) { hotel = h; hotelArea = a; break }
    }
    const trip = routes.find((r) => r.days > 1) ?? routes[0]
    const stops = trip ? trip.stops.filter((st) => st.day === 1).slice(0, 4) : []
    return { stationRows, asok, hotel, hotelArea, hotelStation: hotel?.walk ? byId.get(hotel.walk.station) ?? null : null, stops }
  }, [stations, areas, routes])

  const mapHref = `/${locale}/${city.id}`
  const tripsHref = `/${locale}/${city.id}/trip`

  return (
    <div className="tm-home">
      <RevealObserver />
      <div className="tm-stage">
        <div className="tm-sheet">
          <section className="tm-hero">
            <nav className="tm-hero__nav" data-rise style={{ ['--i' as string]: 0 }}>
              <Link href={mapHref} className="tm-link">{s.nav.map}</Link>
              <span className="tm-wordmark">{s.brand}</span>
              <Link href={tripsHref} className="tm-link">{s.nav.trips}</Link>
            </nav>
            <div className="tm-hero__centre">
              <h1 className="tm-hero__title" data-rise style={{ ['--i' as string]: 1 }}>{s.home.headline}</h1>
              <p className="tm-hero__line" data-rise style={{ ['--i' as string]: 2 }}>{s.home.sentence}</p>
              <Link href={mapHref} className="tm-button" data-rise style={{ ['--i' as string]: 3 }}>{s.home.action}</Link>
            </div>
          </section>

          <section className="tm-intro">
            {s.home.intro.map((p, i) => (
              <p key={i} data-reveal style={{ ['--i' as string]: i }}>
                {p}
                {i === s.home.intro.length - 1 && (
                  <>
                    {' '}
                    <Link href={mapHref} className="tm-link tm-link--under">{s.home.introLink}</Link>
                  </>
                )}
              </p>
            ))}
          </section>

          <section className="tm-areas" aria-labelledby="tm-areas-heading">
            <h2 id="tm-areas-heading" className="tm-h2" data-reveal>{s.home.areasHeading}</h2>
            <ul className="tm-rows" onMouseEnter={() => { hoveringRef.current = true }} onMouseLeave={() => { hoveringRef.current = false }}>
              {areas.map((a, i) => {
                const on = a.id === activeArea
                const name = t(a.name, locale)
                const highlights = a.pins.filter((p) => p.kind !== 'hotel').slice(0, 5)
                return (
                  <li key={a.id} className={`tm-row${on ? ' tm-row--on' : ''}`}>
                    <div ref={setRow(a.id)} data-area={a.id} data-reveal style={{ ['--i' as string]: i }}>
                      <button type="button" className="tm-row__head" onMouseEnter={() => setActiveArea(a.id)} onFocus={() => setActiveArea(a.id)} onClick={() => setActiveArea(a.id)}>
                        <span className="tm-row__dot" style={{ background: `var(--${a.color})` }} aria-hidden="true" />
                        <span className="tm-row__name">{name}</span>
                        <span className="tm-row__meta">{s.home.areaMeta(a.stations.length, a.pins.length)}</span>
                      </button>
                      <div className="tm-row__body">
                        <p>{t(a.tagline, locale)} {s.home.areaFits(a.fits.map((f) => s.guide.fits[f] ?? f).join(', '))}</p>
                      </div>
                    </div>
                    {highlights.length > 0 && (
                      <ol className="tm-hl">
                        {highlights.map((p) => {
                          const picked = cardPin?.pin.id === p.id
                          return (
                            <li key={p.id} className="tm-hl__item">
                              <button type="button" className="tm-hl__card" aria-pressed={picked} onClick={() => setCardPin(picked ? null : { pin: p, area: a })} style={{ ['--pin' as string]: `var(--${a.color})` }}>
                                {p.photo ? (
                                  <span className="tm-hl__photo">
                                    <Image src={p.photo.src} alt={p.photo.alt} fill sizes="(max-width: 1023px) 100vw, 420px" />
                                  </span>
                                ) : (
                                  <span className="tm-hl__photo tm-hl__photo--none" aria-hidden="true" />
                                )}
                                <span className="tm-hl__text">
                                  <span className="tm-hl__kind">{s.pin[p.kind]}</span>
                                  <span className="tm-hl__name">{t(p.name, locale)}</span>
                                  <span className="tm-hl__why">{t(p.why, locale)}</span>
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ol>
                    )}
                    <p className="tm-hl__link"><Link href={mapHref} className="tm-link tm-link--under">{s.home.areaLink(name)}</Link></p>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="tm-how" aria-labelledby="tm-how-heading">
            <h2 id="tm-how-heading" className="tm-h2" data-reveal>{s.home.howHeading}</h2>
            {s.home.how.map((step, i) => (
              <div key={i} className="tm-how__stage">
                <p className="tm-how__p" data-reveal>
                  <strong>{step.lead}</strong> {step.text}
                </p>
                {i === 0 && (
                  <div className="tm-how__evidence" data-reveal style={{ ['--i' as string]: 1 }}>
                    <StationFragment locale={locale} stations={fragments.stationRows} lines={lines} active={fragments.asok} />
                  </div>
                )}
                {i === 1 && fragments.hotel && (
                  <div className="tm-how__evidence" data-reveal style={{ ['--i' as string]: 1 }}>
                    <HotelFragment locale={locale} pin={fragments.hotel} area={fragments.hotelArea} station={fragments.hotelStation} />
                  </div>
                )}
                {i === 2 && fragments.stops.length > 0 && (
                  <div className="tm-how__evidence" data-reveal style={{ ['--i' as string]: 1 }}>
                    <TripStopsFragment locale={locale} stops={fragments.stops} activeId={fragments.stops[1]?.id ?? fragments.stops[0].id} />
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>

        <div className="tm-stage__map" data-ui>
          <StageMap locale={locale} camera={camera} threeD={threeD} areas={areas} route={null} focus={focusArea} card={cardPin} onCloseCard={() => setCardPin(null)} cityId={city.id} stations={stations} />
          <div className="tm-stage__bar">
            <span>{s.home.facts(areas.length, stations.length, routes.length)}</span>
            <span className="tm-stage__showing">{s.home.showing(active ? t(active.name, locale) : cityName)}</span>
          </div>
        </div>
      </div>

      <section className="tm-trips" aria-labelledby="tm-trips-heading">
        <div className="tm-trips__inner">
          <h2 id="tm-trips-heading" className="tm-h2" data-reveal>{s.home.tripsHeading}</h2>
          <div className="tm-trips__drawing" data-reveal style={{ ['--i' as string]: 1 }}>
            <TripsDrawing locale={locale} routes={routes} cityName={cityName} cityCenter={city.camera2d.center} />
          </div>
          <ul className="tm-trips__list">
            {routes.map((r, i) => (
              <li key={r.id} data-reveal style={{ ['--i' as string]: i + 2 }}>
                <Link href={`${tripsHref}/${r.id}`} className="tm-trips__row">
                  <span className="tm-trips__swatch" style={{ background: TRIP_COLORS[i % TRIP_COLORS.length] }} aria-hidden="true" />
                  <span className="tm-trips__name">{t(r.name, locale)}</span>
                  <span className="tm-trips__meta">
                    {s.home.tripMeta([
                      r.duration === 'multi-day' ? s.trip.days(r.days) : s.trip.duration[r.duration],
                      s.trip.mode[r.mode],
                      ...(r.distanceKm !== undefined ? [s.trip.km(r.distanceKm)] : []),
                    ])}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="tm-trips__note" data-reveal style={{ ['--i' as string]: routes.length + 2 }}>
            {s.home.tripsNote} <Link href={tripsHref} className="tm-link tm-link--under">{s.home.tripsLink}</Link>
          </p>
        </div>
      </section>

      <section className="tm-cta">
        <p className="tm-cta__line" data-reveal>{s.home.cta}</p>
        <div className="tm-cta__actions" data-reveal style={{ ['--i' as string]: 1 }}>
          <Link href={mapHref} className="tm-button">{s.home.ctaAction}</Link>
          <Link href={tripsHref} className="tm-link tm-link--under">{s.home.ctaLink}</Link>
        </div>
      </section>

      <SiteFooter locale={locale} cityId={city.id} />
    </div>
  )
}
