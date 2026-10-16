'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type TouchEvent as ReactTouchEvent } from 'react'
import { ArrowLeft, SlidersHorizontal, X } from 'lucide-react'
import type { CityBundle, DayKind, Locale, Pin, PinKind, Station, TimeOfDay, TripRoute } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { supports3D } from '@/lib/map/device'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { nights, useStay } from '@/lib/stay/store'
import { trackOutbound } from '@/lib/links/track'
import { whenLine } from '@/lib/explorer/when'
import { WEEKEND_SLOTS, weekendPlan } from '@/lib/explorer/weekend'
import { activeFilterCount, allPins, DAYS, KIND_CHIPS, distanceM, EMPTY_FILTERS, isFullRange, PRICE_RANGE, TIMES, selectedPlaceCentres, selectedStations, subareaKey, TIER_PRICE, TIERS, visiblePins, WALK_PACE_M_PER_MIN, type FilterState, type PriceRange, type Tier } from '@/lib/explorer/filters'
import { thb } from '@/lib/explorer/price'
import { stationPages } from '@/lib/explorer/stations'
import type { Outline } from '@/components/map/explorer-map'
import { FilterPanel } from './filter-panel'
import { TopSearch, type SearchHit } from './top-search'
import { SiteFooter } from './site-footer'
import { KindBar, KIND_ICONS } from './kind-bar'
import { AreaCard } from './area-card'
import { SaveButton } from '@/components/saved/save-button'
import { useSaved } from '@/lib/saved/store'
import { myHotelChoice, useHotelChoiceVersion } from '@/lib/saved/my-hotel'
import { SavedLink } from '@/components/saved/saved-link'

const ExplorerMap = dynamic(() => import('@/components/map/explorer-map').then((m) => m.ExplorerMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-2" />,
})

/**
 * Glaibaan-style shell: search bar in the header, the map in the middle,
 * filters in a right-hand panel. On wide screens a left column carries the
 * area guide (nothing picked) or the list of places (something picked); on
 * phones that list floats over the map and the filters are a bottom sheet.
 */
export function CityExplorer({ locale, bundle, routes }: { locale: Locale; bundle: CityBundle; routes: TripRoute[] }) {
  const s = strings(locale)
  const stay = useStay()
  const { city, areas } = bundle
  const detected3D = useSyncExternalStore(noopSubscribe, supports3D, () => null)
  const [override3D, setOverride3D] = useState<boolean | null>(null)
  const threeD = override3D ?? detected3D
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [activePin, setActivePin] = useState<Pin | null>(null)
  const [hoverPin, setHoverPin] = useState<string | null>(null)
  // A link from the home page quiz carries "#area=<id>&price=<min>-<max>" (an older "tier=" still works). The hash never reaches the
  // server, so it is read once the page is live, in a frame callback rather than straight in the effect.
  useEffect(() => {
    const apply = () => {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const areaList = (h.get('area') ?? '').split(',').filter((id) => areas.some((a) => a.id === id))
      const area = areaList[0] ?? null
      const tier = h.get('tier')
      const priceParam = h.get('price')
      const stationList = (h.get('station') ?? '').split(',').filter((id) => bundle.stations.some((st) => st.id === id))
      const station = stationList[0] ?? null
      const times = (h.get('time') ?? '').split(',').filter((x): x is TimeOfDay => (TIMES as readonly string[]).includes(x))
      const days = (h.get('day') ?? '').split(',').filter((x): x is DayKind => (DAYS as readonly string[]).includes(x))
      const kinds = (h.get('kind') ?? '').split(',').filter((x): x is PinKind => (KIND_CHIPS as readonly string[]).includes(x))
      // "#pin=<id>" (from the saved list) opens that place: its area filtered, its card open.
      const pinId = h.get('pin')
      const pinHit = pinId ? areas.flatMap((a) => a.pins.map((pin) => ({ pin, area: a }))).find((x) => x.pin.id === pinId) : undefined
      if (pinHit && areaList.length === 0) areaList.push(pinHit.area.id)
      if (!area && !pinHit && !tier && !priceParam && !station && times.length === 0 && days.length === 0 && kinds.length === 0) return
      const m = priceParam?.match(/^(\d+)-(\d+)$/)
      const fromParam: PriceRange | null = m ? { min: Math.max(PRICE_RANGE.min, Number(m[1])), max: Math.min(PRICE_RANGE.max, Number(m[2])) } : null
      const price = fromParam && fromParam.min < fromParam.max ? fromParam : tier && (TIERS as readonly string[]).includes(tier) ? TIER_PRICE[tier as Tier] : null
      const next: FilterState = { ...EMPTY_FILTERS, areas: areaList, stations: stationList, price: isFullRange(price) ? null : price, times, days, kinds }
      setFilters(next)
      if (pinHit) setActivePin(pinHit.pin)
    }
    const id = window.requestAnimationFrame(apply)
    window.addEventListener('hashchange', apply)
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('hashchange', apply)
    }
  }, [areas, bundle.stations])
  const [sheetOpen, setSheetOpen] = useState(false)
  // Phones: the place list starts as a one-line handle so the map stays visible.
  const [listOpen, setListOpen] = useState(false)
  // Phones: a swipe up on the sheet's header makes it tall, a swipe down shrinks it, then closes it.
  const [listTall, setListTall] = useState(false)
  const swipeY = useRef<number | null>(null)
  const onSheetTouchStart = (e: ReactTouchEvent) => { swipeY.current = e.touches[0]?.clientY ?? null }
  const onSheetTouchEnd = (e: ReactTouchEvent) => {
    const y0 = swipeY.current; swipeY.current = null
    const y1 = e.changedTouches[0]?.clientY
    if (y0 === null || y1 === undefined) return
    const dy = y1 - y0
    if (dy < -40) { setListOpen(true); setListTall(true); if (activePin) setActivePin(null) }
    else if (dy > 40) { if (listTall) setListTall(false); else setListOpen(false) }
  }
  // On a phone an open card and an open list fight for the same half of the screen: the card wins, the list folds to its header.
  const listShown = listOpen && !activePin
  // The list column's tabs once something is picked: the places, the trips out of town, the weekend plan.
  const [tab, setTab] = useState<'places' | 'trips' | 'weekend'>('places')

  const pins = useMemo(() => visiblePins(bundle, filters), [bundle, filters])
  // The hotel the reader hearted: for a place, the saved hotel of its own area (the chosen one when there are several, as on the plan pages),
  // else the first saved hotel on this map; places within a 45-minute walk say how far they are from that door.
  const saved = useSaved()
  const choiceVersion = useHotelChoiceVersion()
  const myHotel = useMemo(() => allPins(bundle).map((x) => x.pin).find((p) => p.kind === 'hotel' && saved.includes(p.id)) ?? null, [bundle, saved])
  const hotelFor = useMemo(() => {
    const byArea = new Map<string, Pin | null>()
    for (const area of bundle.areas) {
      const hotels = area.pins.filter((p) => p.kind === 'hotel' && saved.includes(p.id))
      const chosen = myHotelChoice(area.id)
      byArea.set(area.id, hotels.find((h) => h.id === chosen) ?? hotels[0] ?? null)
    }
    return (areaId: string) => byArea.get(areaId) ?? myHotel
    // choiceVersion is read so a new choice recomputes the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, saved, myHotel, choiceVersion])
  const fromHotel = (pin: Pin, hotel: Pin) => Math.max(1, Math.round(distanceM(hotel.location.lon, hotel.location.lat, pin.location.lon, pin.location.lat) / WALK_PACE_M_PER_MIN))
  // "Near me": the browser's position, kept in state only (never in the address). Outside the city it is refused with a note.
  const [locating, setLocating] = useState(false)
  const [nearNote, setNearNote] = useState<string | null>(null)
  // "Share this view": the address already carries the filters, so sharing is the page's own link.
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle')
  const shareView = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared('copied')
    } catch {
      setShared('failed')
    }
    window.setTimeout(() => setShared('idle'), 2500)
  }
  const locate = () => {
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const here: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        const [cx, cy] = city.camera2d.center
        if (distanceM(cx, cy, here[0], here[1]) > 60_000) {
          setNearNote(s.near.away)
          window.setTimeout(() => setNearNote(null), 6000)
          return
        }
        update({ ...filters, areas: [], subareas: [], stations: [], lines: [], near: here })
      },
      () => {
        setLocating(false)
        setNearNote(s.near.denied)
        window.setTimeout(() => setNearNote(null), 6000)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }
  const stations = useMemo(() => selectedStations(bundle, filters), [bundle, filters])
  const centres = useMemo(() => selectedPlaceCentres(bundle, filters), [bundle, filters])
  // Outlines: a ticked area draws its border; a ticked sub-area draws its own, unless its whole area is ticked already.
  const outlines = useMemo<Outline[]>(() => {
    const out: Outline[] = []
    for (const a of areas) {
      if (filters.areas.includes(a.id)) {
        if (a.boundary) out.push({ id: a.id, color: a.color, boundary: a.boundary })
        continue
      }
      for (const sub of a.subareas) {
        if (sub.boundary && filters.subareas.includes(subareaKey(a.id, sub.id))) out.push({ id: `${a.id}/${sub.id}`, color: a.color, boundary: sub.boundary })
      }
    }
    return out
  }, [areas, filters.areas, filters.subareas])
  const stationById = useMemo(() => new Map(bundle.stations.map((st) => [st.id, st])), [bundle])
  // Station id to its page's address, for the stations that have one (enough hotels or places in walking distance).
  const stationSlug = useMemo(() => new Map(stationPages(bundle).flatMap((p) => p.stations.map((st) => [st.id, p.slug] as const))), [bundle])
  const pickedStationPage = filters.stations.length === 1 ? stationSlug.get(filters.stations[0]) : undefined
  const everyPin = useMemo(() => allPins(bundle), [bundle])
  const count = activeFilterCount(filters)

  function update(next: FilterState) {
    setFilters(next)
    setActivePin(null)
    writeHash(next)
  }
  function onPick(hit: SearchHit) {
    if (hit.kind === 'area') update({ ...filters, areas: filters.areas.includes(hit.id) ? filters.areas : [...filters.areas, hit.id] })
    else if (hit.kind === 'subarea') update({ ...filters, subareas: filters.subareas.includes(hit.id) ? filters.subareas : [...filters.subareas, hit.id] })
    else if (hit.kind === 'station') update({ ...filters, stations: filters.stations.includes(hit.id) ? filters.stations : [...filters.stations, hit.id] })
    else {
      update({ ...EMPTY_FILTERS, areas: [hit.areaId] })
      const pin = areas.find((a) => a.id === hit.areaId)?.pins.find((p) => p.id === hit.id) ?? null
      setActivePin(pin)
    }
  }

  const panel = <FilterPanel locale={locale} bundle={bundle} filters={filters} onChange={update} />

  // One area picked, nothing narrower: the weekend plan sits above the list.
  const planArea = filters.areas.length === 1 && filters.subareas.length === 0 && filters.stations.length === 0 && filters.lines.length === 0 ? areas.find((a) => a.id === filters.areas[0]) : undefined
  const plan = useMemo(() => (planArea ? weekendPlan(planArea, filters.price) : null), [planArea, filters.price])
  const weekend = !(planArea && plan) ? (
    <p className="px-1 py-3 text-sm text-ink-2">{s.guide.weekendNeedsArea}</p>
  ) : (
    <section className="tm-weekend" aria-labelledby="tm-weekend-heading" style={{ ['--pin' as string]: `var(--${planArea.color})` }}>
      <h2 id="tm-weekend-heading" className="tm-weekend__heading">{s.guide.weekend(t(planArea.name, locale))}</h2>
      <p className="tm-weekend__lead">{s.guide.weekendLead}</p>
      <Link href={`/${locale}/${city.id}/weekend/${planArea.id}${filters.price ? `?price=${filters.price.min}-${filters.price.max}` : ''}`} className="tm-weekend__share">{s.weekendPage.shareFromMap}</Link>
      <ol className="tm-weekend__slots">
        {WEEKEND_SLOTS.map((slot) => (
          <li key={slot} className="tm-weekend__slot">
            <span className="tm-weekend__time">{s.guide.slots[slot]}</span>
            {plan.slots[slot].length === 0 ? (
              <span className="tm-weekend__empty">{s.guide.slotEmpty}</span>
            ) : (
              <span className="tm-weekend__stops">
                {plan.slots[slot].map((pin) => (
                  <button key={pin.id} type="button" className={`tm-weekend__stop${activePin?.id === pin.id ? ' tm-weekend__stop--on' : ''}`} onClick={() => { setActivePin(pin); setListOpen(false) }}>
                    <span className="tm-weekend__kind">{s.pin[pin.kind]}</span>
                    {t(pin.name, locale)}
                  </button>
                ))}
              </span>
            )}
          </li>
        ))}
        <li className="tm-weekend__slot tm-weekend__slot--stay">
          <span className="tm-weekend__time">{s.guide.stay}</span>
          {plan.hotels.length === 0 ? (
            <span className="tm-weekend__empty">{s.guide.stayNone}</span>
          ) : (
            <span className="tm-weekend__stops">
              {plan.hotels.map((pin) => (
                <button key={pin.id} type="button" className={`tm-weekend__stop${activePin?.id === pin.id ? ' tm-weekend__stop--on' : ''}`} onClick={() => { setActivePin(pin); setListOpen(false) }}>
                  <span className="tm-weekend__kind">{pin.tier ? s.filters.tier[pin.tier] : s.pin.hotel}</span>
                  {t(pin.name, locale)}
                </button>
              ))}
            </span>
          )}
        </li>
      </ol>
    </section>
  )

  const placeList = (
    <ul className="space-y-1">
      {pins.map(({ pin, area }) => {
        const walkStation = pin.walk ? stationById.get(pin.walk.station) : undefined
        const partners = Object.keys(pin.links) as Partner[]
        const active = activePin?.id === pin.id
        const thumb = pin.photos?.[0] ?? pin.photo
        const KindIcon = KIND_ICONS[pin.kind]
        return (
          <li key={pin.id} className="relative">
            {<SaveButton id={pin.id} locale={locale} className="absolute right-2 top-2" />}
            <button type="button" onClick={() => { setActivePin(pin); setListOpen(false) }} onMouseEnter={() => setHoverPin(pin.id)} onMouseLeave={() => setHoverPin(null)} onFocus={() => setHoverPin(pin.id)} onBlur={() => setHoverPin(null)} className={`tm-place tm-place--save ${active ? 'border-ink bg-white' : hoverPin === pin.id ? 'border-ink-2 bg-white' : 'border-line bg-white/70'}`}>
              {/* A square picture on the left: the place's first photo, or its kind's icon on paper until one is fetched. */}
              {thumb ? (
                <Image src={thumb.src} alt="" width={72} height={72} sizes="72px" className="tm-place__thumb" />
              ) : (
                <span aria-hidden="true" className="tm-place__thumb tm-place__thumb--empty" style={{ color: `var(--${area.color})` }}><KindIcon className="size-6" /></span>
              )}
              <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: `var(--${area.color})` }} />
                <span className="text-[11px] font-semibold uppercase text-ink-2">{s.pin[pin.kind]}</span>
                <span className="truncate font-medium">{t(pin.name, locale)}</span>
              </span>
              <span className="block text-ink-2">{t(pin.why, locale)}</span>
              {whenLine(pin, locale) && <span className="block text-xs font-medium text-accent">{whenLine(pin, locale)}</span>}
              {pin.price && <span className="block text-xs text-ink-2">{s.guide.priceFrom(thb(pin.price.from, locale))}{pin.price.basis === 'tier-estimate' ? ` (${s.guide.priceEstimate})` : ''}</span>}
              {pin.price && stay && <span className="tm-wk__stay block text-xs">{s.guide.stayTotal(thb(pin.price.from * nights(stay), locale), nights(stay))}</span>}
              {pin.walk && walkStation && (
                <span className="block text-xs text-ink-2">
                  {s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${walkStation.code ? walkStation.code + ' ' : ''}${t(walkStation.name, locale)}`)}
                </span>
              )}
              {pin.kind !== 'hotel' && hotelFor(area.id) && fromHotel(pin, hotelFor(area.id)!) <= 45 && <span className="tm-wk__from block text-xs">{s.weekendPage.fromHotel(fromHotel(pin, hotelFor(area.id)!), t(hotelFor(area.id)!.name, locale))}</span>}
              {filters.near && <span className="block text-xs font-medium text-ink">{s.near.from(Math.max(1, Math.ceil(distanceM(filters.near[0], filters.near[1], pin.location.lon, pin.location.lat) / WALK_PACE_M_PER_MIN)))}</span>}
              </span>
            </button>
            {active && partners.length > 0 && (
              <div className="mt-1 flex gap-2 px-1">
                {partners.map((p) => (
                  <a key={p} href={buildOutboundUrl(p, pin.links[p]!, subIdFor(`${city.id}-${area.id}`, pin.id), stay)} onClick={() => trackOutbound(p, subIdFor(`${city.id}-${area.id}`, pin.id))} target="_blank" rel="noopener sponsored" className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white">
                    {p}
                  </a>
                ))}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )

  const tabs = (
    <div className="tm-tabs" role="tablist">
      {(['places', 'trips', 'weekend'] as const).map((k) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} className="tm-tabs__tab" onClick={() => setTab(k)}>{s.guide.tabs[k]}</button>
      ))}
    </div>
  )
  const column = tab === 'weekend' ? weekend : tab === 'trips' ? (
    <TripList locale={locale} cityId={city.id} routes={routes} />
  ) : (
    <>
      <p className="tm-list__head px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
        <span>{s.guide.showing(pins.length)}</span>
        {activeFilterCount(filters) > 0 && pins.length > 0 && (
          <button type="button" className="tm-list__share" onClick={shareView}>
            {shared === 'copied' ? s.guide.viewCopied : shared === 'failed' ? s.guide.viewCopyFailed : s.guide.shareView}
          </button>
        )}
      </p>
      {pins.length === 0 && (
        <div className="tm-empty">
          <p className="text-sm text-ink-2">{s.filters.noResults}</p>
          <button type="button" className="tm-card__link tm-card__link--quiet" onClick={() => update({ ...filters, kinds: [], tiers: [], price: null, times: [], days: [], near: null })}>
            {s.filters.showAllHere}
          </button>
        </div>
      )}
      {placeList}
    </>
  )


  return (
    <div className="flex h-dvh flex-col">
      {/* Phones: brand and filter button on one line, the search on its own line under them. */}
      <header className="tm-explorer__hdr flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-paper px-3 py-2 md:flex-nowrap md:px-4">
        <Link href={`/${locale}`} className="shrink-0 font-display text-xl font-semibold tracking-tight">
          {s.brand}
        </Link>
        <div className="order-last w-full md:order-none md:mx-auto md:w-full md:max-w-xl">
          <TopSearch locale={locale} bundle={bundle} onPick={onPick} />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-sm font-medium lg:hidden"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          {s.filters.open}
          {count > 0 && <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-white">{count}</span>}
        </button>
        <Link href={`/${locale}/${city.id}/trip`} className="hidden shrink-0 rounded-full border border-line bg-white px-3 py-2 text-sm font-medium md:inline-block">{s.nav.trips}</Link>
        <SavedLink locale={locale} className="tm-saved-link hidden shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-sm font-medium md:inline-flex" />
      </header>
      <KindBar locale={locale} bundle={bundle} filters={filters} onChange={update} onNear={locate} locating={locating} />
      {nearNote && <p role="status" className="tm-near__note">{nearNote}</p>}

      <main className="relative flex min-h-0 flex-1">
        <h1 className="sr-only md:hidden">{s.guide.heading(t(city.name, locale))}</h1>
        {/* Wide screens: the guide, or the places found, at the left. */}
        <aside aria-label={s.a11y.places} className="hidden w-[22rem] shrink-0 flex-col overflow-y-auto border-r border-line bg-paper md:flex">
          {count === 0 ? (
            <AreaGuide locale={locale} bundle={bundle} routes={routes} onPickArea={(id) => update({ ...filters, areas: [id] })} onPickSubarea={(areaId, subId) => onPick({ kind: 'subarea', id: subareaKey(areaId, subId) } as SearchHit)} onPickStation={(id) => onPick({ kind: 'station', id } as SearchHit)} />
          ) : (
            <div className="p-3">
              {/* Back leaves the place (areas, sub-areas, stations); the budget, time and kind preferences stay. */}
              <button type="button" onClick={() => update({ ...filters, areas: [], subareas: [], stations: [], lines: [], near: null })} className="mb-2 flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
                <ArrowLeft aria-hidden="true" className="size-4" />
                {s.guide.back}
              </button>
              {pickedStationPage && (
                <Link href={`/${locale}/${city.id}/station/${pickedStationPage}`} className="tm-weekend__share mb-2">
                  {s.guide.stationPage}
                </Link>
              )}
              {tabs}
              {column}
            </div>
          )}
        </aside>

        <div className="relative min-h-0 flex-1">
          {threeD !== null && (
            <ExplorerMap
              key={threeD ? '3d' : '2d'}
              locale={locale}
              cityId={city.id}
              cityCamera={threeD ? city.camera : city.camera2d}
              threeD={threeD}
              areas={areas}
              pins={pins}
              allPins={everyPin}
              allStations={bundle.stations}
              stations={stations}
              centres={centres}
              near={filters.near}
              outlines={outlines}
              activePinId={activePin?.id ?? null}
              hoverPinId={hoverPin}
              onHoverPin={setHoverPin}
              onSelectArea={(id) => update({ ...filters, areas: [id] })}
              onSelectPin={(pin) => {
                // A place picked from the tip may sit outside the current filters: widen to its area so it is on the map.
                const area = areas.find((a) => a.pins.some((p) => p.id === pin.id))
                if (area && !pins.some((v) => v.pin.id === pin.id)) setFilters({ ...EMPTY_FILTERS, areas: [area.id] })
                setActivePin(pin)
              }}
              onClosePin={() => setActivePin(null)}
            />
          )}
          {threeD !== null && (
            <button type="button" data-map-overlay="top" onClick={() => setOverride3D(!threeD)} className="absolute left-3 top-3 rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-semibold shadow-sm">
              {threeD ? s.city.flat : s.city.tilt}
            </button>
          )}

          {/* Phones: the places found float over the map. */}
          {count > 0 && (
            <div data-map-overlay="bottom" className={`absolute inset-x-3 bottom-3 z-10 flex flex-col rounded-xl border border-line bg-paper/95 shadow-lg md:hidden ${listShown ? (listTall ? 'max-h-[88%]' : 'max-h-[45%]') : ''}`}>
              <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-line" />
              <button type="button" aria-expanded={listShown} onTouchStart={onSheetTouchStart} onTouchEnd={onSheetTouchEnd} onClick={() => { if (activePin) { setActivePin(null); setListOpen(true) } else setListOpen((o) => !o) }} className="flex min-h-11 items-center justify-between px-3 pt-1 text-sm font-semibold">
                <span>{s.filters.results(pins.length)}</span>
                <span className="text-xs font-medium text-ink-2">{listShown ? s.filters.hideList : s.filters.showList}</span>
              </button>
              {listShown && (
                <div className="overflow-y-auto px-2 pb-2">
                  {tabs}
                  {column}
                </div>
              )}
            </div>
          )}
          {count === 0 && (
            <p data-map-overlay="bottom" className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl border border-line bg-paper/95 px-3 py-2 text-center text-sm text-ink-2 shadow md:hidden">
              {s.filters.emptyHint}
            </p>
          )}
        </div>

        {/* Wide screens: the panel sits on the right. */}
        <aside aria-label={s.a11y.filters} className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-line bg-paper lg:block">
          {panel}
          <SiteFooter locale={locale} cityId={city.id} compact />
        </aside>

        {/* Phones: the same panel as a bottom sheet. */}
        {sheetOpen && (
          <div className="absolute inset-0 z-40 lg:hidden">
            <button type="button" aria-label={s.filters.close} onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-black/40" />
            <div role="dialog" aria-modal="true" aria-label={s.filters.title} className="absolute inset-x-0 bottom-0 flex h-[74dvh] flex-col rounded-t-2xl border-t border-line bg-paper shadow-2xl">
              <div className="flex items-center justify-between px-3 pt-2">
                <span className="mx-auto h-1.5 w-10 rounded-full bg-ink-2/30" />
                <button type="button" onClick={() => setSheetOpen(false)} className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full text-ink-2">
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{panel}</div>
              <div className="border-t border-line p-3">
                <button type="button" onClick={() => setSheetOpen(false)} className="w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white">
                  {s.filters.close} {count > 0 ? `(${s.filters.results(pins.length)})` : ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/**
 * The address carries the filters the home and station pages can send (areas,
 * stations, budget, time, day, kind), so a view can be bookmarked or sent on.
 * Sub-areas and lines stay out: nothing links in with them.
 */
function writeHash(f: FilterState) {
  const h = new URLSearchParams()
  if (f.areas.length) h.set('area', f.areas.join(','))
  if (f.stations.length) h.set('station', f.stations.join(','))
  if (f.price && !isFullRange(f.price)) h.set('price', `${f.price.min}-${f.price.max}`)
  if (f.times.length) h.set('time', f.times.join(','))
  if (f.days.length) h.set('day', f.days.join(','))
  if (f.kinds.length) h.set('kind', f.kinds.join(','))
  const next = h.toString().replace(/%2C/g, ',')
  const url = `${window.location.pathname}${window.location.search}${next ? `#${next}` : ''}`
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url)
}

/** The left column while nothing is picked: the areas as cards, then the trips. */
function AreaGuide({ locale, bundle, routes, onPickArea, onPickSubarea, onPickStation }: { locale: Locale; bundle: CityBundle; routes: TripRoute[]; onPickArea: (id: string) => void; onPickSubarea: (areaId: string, subId: string) => void; onPickStation: (id: string) => void }) {
  const s = strings(locale)
  const { city, areas } = bundle
  const stationById = new Map(bundle.stations.map((st) => [st.id, st]))
  return (
    <div className="p-3">
      <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">{s.guide.heading(t(city.name, locale))}</h1>
      <p className="mt-1 text-sm text-ink-2">{s.guide.intro}</p>
      <ul className="mt-3 space-y-3">
        {areas.map((a) => (
          <AreaCard key={a.id} locale={locale} area={a} stations={a.stations.map((id) => stationById.get(id)).filter((st): st is Station => !!st)} onPick={onPickArea} onPickSubarea={onPickSubarea} onPickStation={onPickStation} />
        ))}
      </ul>
      {routes.length > 0 && (
        <>
          <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-ink-2">{s.guide.tripsHeading}</h2>
          <TripList locale={locale} cityId={city.id} routes={routes} />
        </>
      )}
    </div>
  )
}

function noopSubscribe() {
  return () => {}
}

const TRIP_LENGTHS = ['morning', 'afternoon', '1', '2', '3', '4', '5', '7'] as const
type TripLength = (typeof TRIP_LENGTHS)[number]

/** Whether a trip is of the picked length: a part of a day, or a number of days. */
function tripFits(r: TripRoute, len: TripLength | null): boolean {
  if (!len) return true
  if (len === 'morning' || len === 'afternoon') return r.duration === len
  const days = r.duration === 'multi-day' ? r.days : 1
  return days === Number(len)
}

/** The trips out of town, one row each, behind length pills, with the link to the trips page. */
function TripList({ locale, cityId, routes }: { locale: Locale; cityId: string; routes: TripRoute[] }) {
  const s = strings(locale)
  const [len, setLen] = useState<TripLength | null>(null)
  const shown = routes.filter((r) => tripFits(r, len))
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {TRIP_LENGTHS.map((k) => {
          const on = len === k
          const n = routes.filter((r) => tripFits(r, k)).length
          // A length no trip has yet is not offered; with four trips, "4 days 0" was half the row.
          if (n === 0 && !on) return null
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => setLen(on ? null : k)} className={`tm-kind tm-kind--small${on ? ' tm-kind--on' : ''}`}>
              {s.guide.tripLength[k]}
              <span className="tm-kind__count">{n}</span>
              {on && <X aria-hidden="true" className="tm-kind__x size-3.5" />}
            </button>
          )
        })}
      </div>
      {shown.length === 0 && <p className="px-2 py-2 text-sm text-ink-2">{s.guide.noTripsOfLength}</p>}
      <ul className="mt-2 space-y-1">
        {shown.map((r) => (
          <li key={r.id}>
            <Link href={`/${locale}/${cityId}/trip/${r.id}`} className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper-2">
              <span className="font-medium">{t(r.name, locale)}</span>
              <span className="shrink-0 text-xs text-ink-2">{r.duration === 'multi-day' ? s.trip.days(r.days) : s.trip.duration[r.duration]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={`/${locale}/${cityId}/trip`} className="mt-2 inline-block px-2 text-sm underline underline-offset-2">{s.guide.tripsLink}</Link>
    </>
  )
}
