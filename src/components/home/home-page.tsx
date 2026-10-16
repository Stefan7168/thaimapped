'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Area, Camera, CityBundle, Locale, Pin, TripRoute } from '@/lib/content/types'
import { CmpWrap } from '@/components/stay/cmp-wrap'
import { allPins, TIER_PRICE, TIERS } from '@/lib/explorer/filters'
import { QUIZ_PACES, QUIZ_PURPOSES, rankAreas, type Pace, type QuizAnswers } from '@/lib/explorer/quiz'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { supports3D } from '@/lib/map/device'
import { bangkokNow } from '@/lib/explorer/when'
import { addSaved, useSaved } from '@/lib/saved/store'
import { StayPicker } from '@/components/stay/stay-picker'
import { chooseHotel, myHotelChoice, useHotelChoiceVersion } from '@/lib/saved/my-hotel'
import { nights, useStay } from '@/lib/stay/store'
import { thb } from '@/lib/explorer/price'
import { RevealObserver } from '@/components/motion/reveal'
import { SiteFooter } from '@/components/explorer/site-footer'
import { HotelFragment, StationFragment, TripStopsFragment } from './ui-fragments'
import { TRIP_COLORS, TripsDrawing } from './trips-drawing'

const StageMap = dynamic(() => import('@/components/map/stage-map').then((m) => m.StageMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper" />,
})

// One reading per page load: useSyncExternalStore needs the same object back each time, and the slot does not change mid-visit.
let nowCache: ReturnType<typeof bangkokNow> | null = null
const nowSnapshot = () => nowCache ?? (nowCache = bangkokNow())

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
  // The quiz: three answers rank the areas; the best one lights up on the map.
  const [answers, setAnswers] = useState<QuizAnswers>({ purpose: null, tier: null, pace: null })
  const ranked = useMemo(() => (answers.purpose || answers.tier || answers.pace ? rankAreas(areas, answers) : []), [areas, answers])
  const best = ranked.length > 0 && ranked[0].score > 0 ? ranked[0] : null
  const runnersUp = best ? ranked.slice(1, 3).filter((r) => r.score > 0 && r.score >= best.score - 1) : []
  // Answering lights the winning area up on the map (set in the handler, not an effect).
  const answer = (patch: Partial<QuizAnswers>) =>
    setAnswers((prev) => {
      const next = { ...prev, ...patch }
      const top = rankAreas(areas, next)[0]
      if (top && top.score > 0) setActiveArea(top.area.id)
      return next
    })
  // The highlight the reader tapped open.
  const [cardPin, setCardPin] = useState<{ pin: Pin; area: Area } | null>(null)
  // A returning visitor with a hearted hotel gets a way straight back to their plan.
  const saved = useSaved()
  const stay = useStay()
  // The first saved hotel, unless its area has a chosen one (picked on a plan page): then that hotel, so the line and the plan agree.
  const choiceVersion = useHotelChoiceVersion()
  const myHotel = useMemo(() => {
    const hotels = allPins(bundle).filter((x) => x.pin.kind === 'hotel' && saved.includes(x.pin.id))
    const first = hotels[0]
    if (!first) return null
    const chosen = myHotelChoice(first.area.id)
    return hotels.find((x) => x.area.id === first.area.id && x.pin.id === chosen) ?? first
    // choiceVersion is read so a new choice recomputes the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, saved, choiceVersion])
  const stayLabel = stay ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).formatRange(new Date(`${stay.checkIn}T12:00:00`), new Date(`${stay.checkOut}T12:00:00`)) : null
  // With no hotel saved, the first saved place still names an area to plan; shown only when there is no hotel line.
  const myPlace = useMemo(() => (myHotel ? null : allPins(bundle).find((x) => x.pin.kind !== 'hotel' && saved.includes(x.pin.id)) ?? null), [bundle, saved, myHotel])
  // Bangkok's clock, read in the browser only, so the server's HTML carries no time of its own.
  const now = useSyncExternalStore(noopSubscribe, nowSnapshot, () => null)
  // On a phone the map is a sticky band above the scrolling text, so a tapped card would open out of sight: bring the map back first.
  const showStageMap = () => {
    if (window.innerWidth > 1023) return
    // The map is sticky, so its own top never moves: scroll to where the stage begins, where the map sits uncovered.
    const stage = document.querySelector('.tm-stage')
    if (stage) window.scrollTo({ top: window.scrollY + stage.getBoundingClientRect().top, behavior: 'smooth' })
  }
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
  // Keyed on the area id, not the card object, so opening a card does not re-frame the map.
  const focusAreaId = cardPin?.area.id ?? activeArea
  // When the quiz has answered with this area and a hotel, that hotel joins the pins, drawn as "mine".
  const quizHotel = best && best.area.id === focusAreaId ? best.hotel : null
  const focusArea = useMemo(() => {
    const area = areas.find((a) => a.id === focusAreaId)
    if (!area) return null
    const pins = area.pins.filter((p) => p.kind !== 'hotel').slice(0, 5)
    return quizHotel ? { area, pins: [...pins, quizHotel], mine: quizHotel.id } : { area, pins }
  }, [areas, focusAreaId, quizHotel])

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
  // The train lines that reach an area, from its stations: "BTS Sukhumvit, MRT Blue".
  const stationById = useMemo(() => new Map(stations.map((st) => [st.id, st])), [stations])
  const areaLines = (a: Area): string[] => {
    const seen = new Set<string>()
    for (const id of a.stations) {
      const st = stationById.get(id)
      if (st) seen.add(`${st.system} ${st.line}`)
    }
    return [...seen]
  }
  const tripsHref = `/${locale}/${city.id}/trip`

  return (
    <div className="tm-home">
      <RevealObserver />
      <main>
      <div className="tm-stage">
        <div className="tm-sheet">
          <section className="tm-hero">
            <nav className="tm-hero__nav" aria-label={s.a11y.siteNav} data-rise style={{ ['--i' as string]: 0 }}>
              <Link href={mapHref} className="tm-link">{s.nav.map}</Link>
              <span className="tm-wordmark">{s.brand}</span>
              <Link href={tripsHref} className="tm-link">{s.nav.trips}</Link>
            </nav>
            <div className="tm-hero__centre">
              <h1 className="tm-hero__title" data-rise style={{ ['--i' as string]: 1 }}>{s.home.headline}</h1>
              <p className="tm-hero__line" data-rise style={{ ['--i' as string]: 2 }}>{s.home.sentence}</p>
              <Link href={mapHref} className="tm-button" data-rise style={{ ['--i' as string]: 3 }}>{s.home.action}</Link>
              {/* The one thing on this page that changes with the clock: what Bangkok is doing right now, and the two shortcuts people actually want. */}
              {now && (
                <p className="tm-hero__now" data-rise style={{ ['--i' as string]: 4 }}>
                  {s.home.nowLine(s.filters.time[now.time].toLowerCase())}{' '}
                  <Link href={`/${locale}/${city.id}#time=${now.time === 'night' ? 'night' : now.time === 'evening' ? 'evening,night' : now.time}`} className="tm-link tm-link--under">{s.home.nowLink(now.time)}</Link>
                  {' · '}
                  <a href="#tm-quiz" className="tm-link tm-link--under">{s.home.weekendLink}</a>
                </p>
              )}
              {myHotel && (
                <p className="tm-hero__now tm-hero__mine">
                  {s.home.yourWeekend(t(myHotel.pin.name, locale), t(myHotel.area.name, locale))}
                  {/* With dates: the range, then the stay's cost at the hotel's class-typical rate (which names the nights), else the range and the nights. */}
                  {stay && stayLabel ? (myHotel.pin.price ? <>{` · ${stayLabel} · `}<span title={myHotel.pin.price.basis === 'tier-estimate' ? s.guide.priceEstimate : undefined}>{s.guide.stayTotal(thb(myHotel.pin.price.from * nights(stay), locale), nights(stay))}{myHotel.pin.price.basis === 'tier-estimate' ? '*' : ''}</span></> : ` · ${stayLabel}, ${s.stay.nights(nights(stay))}`) : ''}{' · '}
                  <Link href={`/${locale}/${city.id}/weekend/${myHotel.area.id}?hotel=${myHotel.pin.id}`} className="tm-link tm-link--under">{s.home.yourWeekendLink}</Link>
                  {!stay && <>{' · '}<a href="#tm-quiz" className="tm-link tm-link--under">{s.home.setDates}</a></>}
                </p>
              )}
              {/* Half a plan: dates with no hotel, or a saved place with no hotel. Each line says what it knows and the one next step. */}
              {!myHotel && stay && stayLabel && (
                <p className="tm-hero__now tm-hero__mine">
                  {s.home.yourDates(stayLabel, s.stay.nights(nights(stay)))}{' · '}
                  {myPlace ? (
                    <Link href={`/${locale}/${city.id}/weekend/${myPlace.area.id}`} className="tm-link tm-link--under">{s.home.quiz.plan(t(myPlace.area.name, locale))}</Link>
                  ) : (
                    <a href="#tm-quiz" className="tm-link tm-link--under">{s.home.pickArea}</a>
                  )}
                </p>
              )}
              {!myHotel && !stay && myPlace && (
                <p className="tm-hero__now tm-hero__mine">
                  {s.home.yourPlace(t(myPlace.pin.name, locale), t(myPlace.area.name, locale))}{' · '}
                  <Link href={`/${locale}/${city.id}/weekend/${myPlace.area.id}`} className="tm-link tm-link--under">{s.home.quiz.plan(t(myPlace.area.name, locale))}</Link>
                </p>
              )}
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

          <section id="tm-quiz" className="tm-quiz" aria-labelledby="tm-quiz-heading">
            <h2 id="tm-quiz-heading" className="tm-h2" data-reveal>{s.home.quiz.heading}</h2>
            <p className="tm-quiz__lead" data-reveal>{s.home.quiz.lead}</p>
            <div className="tm-quiz__q" data-reveal>
              <p className="tm-quiz__label">{s.home.quiz.purpose}</p>
              <div className="tm-quiz__chips">
                {QUIZ_PURPOSES.map((v) => (
                  <button key={v} type="button" aria-pressed={answers.purpose === v} className="tm-quiz__chip" onClick={() => answer({ purpose: answers.purpose === v ? null : v })}>{s.home.quiz.purposes[v]}</button>
                ))}
              </div>
            </div>
            <div className="tm-quiz__q" data-reveal>
              <p className="tm-quiz__label">{s.home.quiz.tier}</p>
              <div className="tm-quiz__chips">
                {TIERS.map((v) => (
                  <button key={v} type="button" aria-pressed={answers.tier === v} className="tm-quiz__chip" onClick={() => answer({ tier: answers.tier === v ? null : v })}>{s.filters.tier[v]}</button>
                ))}
              </div>
            </div>
            <div className="tm-quiz__q" data-reveal>
              <p className="tm-quiz__label">{s.home.quiz.pace}</p>
              <div className="tm-quiz__chips">
                {(Object.keys(QUIZ_PACES) as Pace[]).map((v) => (
                  <button key={v} type="button" aria-pressed={answers.pace === v} className="tm-quiz__chip" onClick={() => answer({ pace: answers.pace === v ? null : v })}>{s.home.quiz.paces[v]}</button>
                ))}
              </div>
            </div>
            {/* Dates are optional here: set once, they price every hotel and booking link on the site for the stay. */}
            <div className="tm-quiz__q" data-reveal>
              <p className="tm-quiz__label">{s.home.quiz.when}</p>
              <StayPicker locale={locale} bare />
            </div>
            <div className="tm-quiz__result" aria-live="polite">
              {!best ? (
                <p className="tm-quiz__empty">{s.home.quiz.empty}</p>
              ) : (
                <div className="tm-quiz__card" style={{ ['--pin' as string]: `var(--${best.area.color})` }}>
                  <p className="tm-quiz__name">{s.home.quiz.result(t(best.area.name, locale))}</p>
                  <p className="tm-quiz__why">{t(best.area.tagline, locale)}</p>
                  {answers.tier && (best.hotel ? (
                    <p className="tm-quiz__hotel">
                      <span className="tm-quiz__label">{s.home.quiz.hotelPick}</span>
                      <strong>{t(best.hotel.name, locale)}</strong> {t(best.hotel.why, locale)}
                      {/* With dates set in the row above, the pick says what the stay comes to (a class-typical estimate, marked as such). */}
                      {best.hotel.price && stay && <span className="tm-quiz__total">{s.guide.stayTotal(thb(best.hotel.price.from * nights(stay), locale), nights(stay))}{best.hotel.price.basis === 'tier-estimate' ? ` (${s.guide.priceEstimate})` : ''}</span>}
                      {/* One tap keeps the pick: every page then walks from this door, and the hero line above says so on the next visit. */}
                      <span className="tm-quiz__keep">{saved.includes(best.hotel.id) ? <span className="tm-wk__shared-done">{s.weekendPage.sentHotelSaved}</span> : <button type="button" className="tm-link tm-link--under" onClick={() => { addSaved([best.hotel!.id]); chooseHotel(best.area.id, best.hotel!.id) }}>{s.weekendPage.saveSentHotel}</button>}</span>
                    </p>
                  ) : (
                    <p className="tm-quiz__hotel">{s.home.quiz.noHotel}</p>
                  ))}
                  {runnersUp.length > 0 && (
                    <p className="tm-quiz__also">
                      {s.home.quiz.alsoFitsLead}{' '}
                      {runnersUp.map((r, i) => (
                        <span key={r.area.id}>
                          {i > 0 && ', '}
                          <Link href={`/${locale}/${city.id}/weekend/${r.area.id}${answers.tier ? `?price=${TIER_PRICE[answers.tier].min}-${TIER_PRICE[answers.tier].max}` : ''}`} className="tm-link tm-link--under">{t(r.area.name, locale)}</Link>
                        </span>
                      ))}
                    </p>
                  )}
                  <span className="tm-quiz__actions">
                    <Link href={`/${locale}/${city.id}/weekend/${best.area.id}${answers.tier ? `?price=${TIER_PRICE[answers.tier].min}-${TIER_PRICE[answers.tier].max}` : ''}`} className="tm-button">{s.home.quiz.plan(t(best.area.name, locale))}</Link>
                    <Link href={`${mapHref}#area=${best.area.id}${answers.tier ? `&price=${TIER_PRICE[answers.tier].min}-${TIER_PRICE[answers.tier].max}` : ''}`} className="tm-link tm-link--under">{s.home.quiz.open(t(best.area.name, locale))}</Link>
                  </span>
                </div>
              )}
            </div>
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
                              <button type="button" className="tm-hl__card" aria-pressed={picked} onClick={() => { setCardPin(picked ? null : { pin: p, area: a }); if (!picked) showStageMap() }} style={{ ['--pin' as string]: `var(--${a.color})` }}>
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
                    <p className="tm-hl__link">
                      <Link href={`/${locale}/${city.id}/area/${a.id}`} className="tm-link tm-link--under">{s.home.areaPageLink(name)}</Link>
                      <span className="tm-hl__sep" aria-hidden="true"> · </span>
                      <Link href={`${mapHref}#area=${a.id}`} className="tm-link tm-link--under">{s.home.areaLink(name)}</Link>
                    </p>
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
          <StageMap locale={locale} camera={camera} threeD={threeD} areas={areas} route={null} focus={focusArea} card={cardPin} onCloseCard={() => setCardPin(null)} cityId={city.id} stations={stations} onSelectArea={(id) => { setActiveArea(id); document.querySelector(`[data-area="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
          <div className="tm-stage__bar" data-map-overlay="bottom">
            <span>{s.home.facts(areas.length, stations.length, routes.length)}</span>
            <span className="tm-stage__showing">{s.home.showing(active ? t(active.name, locale) : cityName)}</span>
          </div>
        </div>
      </div>

      <section className="tm-areas-cmp" aria-labelledby="tm-areas-cmp-heading">
        <div className="tm-areas-cmp__inner" data-reveal>
        <h2 id="tm-areas-cmp-heading" className="tm-h2">{s.home.compare.heading}</h2>
        <p className="tm-saved__note">{s.home.compare.lead}</p>
        <CmpWrap locale={locale}>
          <table className="tm-cmp tm-cmp--areas">
            <thead>
              <tr>
                <td className="tm-cmp__corner" />
                {areas.map((a) => <th key={a.id} scope="col"><Link href={`/${locale}/${city.id}/area/${a.id}`} className="tm-link">{t(a.name, locale)}</Link></th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{s.home.compare.bestFor}</th>
                {areas.map((a) => <td key={a.id}>{a.fits.map((f) => s.home.compare.fits[f] ?? f).join(', ')}</td>)}
              </tr>
              <tr>
                <th scope="row">{s.home.compare.trains}</th>
                {areas.map((a) => <td key={a.id}>{areaLines(a).join(', ')}</td>)}
              </tr>
              <tr>
                <th scope="row">{s.home.compare.hotels}</th>
                {areas.map((a) => {
                  const hotels = a.pins.filter((p) => p.kind === 'hotel')
                  const walks = hotels.map((h) => h.walk?.minutes).filter((m): m is number => typeof m === 'number')
                  return <td key={a.id}>{s.home.compare.hotelsCell(hotels.length, walks.length ? Math.min(...walks) : null, walks.length ? Math.max(...walks) : null)}</td>
                })}
              </tr>
              <tr>
                <th scope="row">{s.home.compare.places}</th>
                {areas.map((a) => <td key={a.id}>{s.home.compare.placesCell(a.pins.filter((p) => p.kind !== 'hotel').length)}</td>)}
              </tr>
              <tr>
                <th scope="row">{s.home.compare.weekend}</th>
                {areas.map((a) => <td key={a.id}><Link href={`/${locale}/${city.id}/weekend/${a.id}`} className="tm-link tm-link--under">{s.home.compare.plan}</Link></td>)}
              </tr>
            </tbody>
          </table>
        </CmpWrap>
        </div>
      </section>

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
      </main>

      <SiteFooter locale={locale} cityId={city.id} />
    </div>
  )
}
