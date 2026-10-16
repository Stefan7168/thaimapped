import type { Area, AreaPhoto, Locale, Pin, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { whenLine } from '@/lib/explorer/when'
import { strings } from '@/lib/i18n/strings'
import { thb } from '@/lib/explorer/price'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { directionsUrl } from '@/lib/links/directions'
import { nights, stayNow } from '@/lib/stay/store'
import { savedIds, toggleSaved } from '@/lib/saved/store'
import { chooseHotel, myHotelChoice } from '@/lib/saved/my-hotel'
import { distanceM, WALK_PACE_M_PER_MIN } from '@/lib/explorer/filters'
import { trackOutbound } from '@/lib/links/track'
import type { NearbyPin } from '@/lib/explorer/filters'
import type { AirportLeg, AirportRoutes } from '@/lib/transit/from-airport'
import { rideSentence } from '@/components/stay/from-airport'

/**
 * The card's pictures: one photograph, or a slider the visitor swipes or
 * steps through with arrows, each slide carrying its own credit.
 */
function photoSlider(photos: AreaPhoto[], s: ReturnType<typeof strings>): HTMLElement {
  const fig = document.createElement('figure')
  fig.className = 'tm-card__photo'
  const track = document.createElement('div')
  track.className = 'tm-card__track'
  const caps: HTMLElement[] = []
  photos.forEach((photo, i) => {
    const img = document.createElement('img')
    // The optimiser serves a 640 px copy: the card is 300 px wide and the file is 1600 px.
    img.src = `/_next/image?url=${encodeURIComponent(photo.src)}&w=640&q=75`
    img.alt = photo.alt
    img.loading = i === 0 ? 'eager' : 'lazy'
    img.draggable = false
    track.append(img)
    const cap = document.createElement('figcaption')
    const credit = document.createElement('a')
    credit.href = photo.source
    credit.target = '_blank'
    credit.rel = 'noopener'
    credit.textContent = photo.credit
    cap.append(credit, ` (${photo.licence})`)
    cap.hidden = i !== 0
    caps.push(cap)
  })
  fig.append(track, ...caps)
  if (photos.length > 1) {
    fig.classList.add('tm-card__photo--slider')
    const dots = document.createElement('div')
    dots.className = 'tm-card__dots'
    const dotEls = photos.map((_, i) => {
      const d = document.createElement('button')
      d.type = 'button'
      d.className = 'tm-card__dot'
      d.setAttribute('aria-label', s.card.photoOf(i + 1, photos.length))
      d.addEventListener('click', () => go(i))
      dots.append(d)
      return d
    })
    let at = 0
    const show = (i: number) => {
      at = i
      caps.forEach((c, j) => (c.hidden = j !== i))
      dotEls.forEach((d, j) => d.classList.toggle('is-on', j === i))
    }
    const go = (i: number) => {
      const next = (i + photos.length) % photos.length
      track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' })
      show(next)
    }
    // A swipe moves the track; read the slide it settled on.
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
      if (i !== at) show(i)
    }, { passive: true })
    const arrow = (dir: -1 | 1) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `tm-card__arrow tm-card__arrow--${dir < 0 ? 'prev' : 'next'}`
      b.setAttribute('aria-label', dir < 0 ? s.card.photoPrev : s.card.photoNext)
      b.textContent = dir < 0 ? '‹' : '›'
      b.addEventListener('click', (e) => { e.stopPropagation(); go(at + dir) })
      return b
    }
    fig.append(arrow(-1), arrow(1), dots)
    show(0)
  }
  return fig
}

/** The card that opens on a pin: what it is, why it is here, how far from the train, where to book. */
/** The same "from the airports" lines the hotel cards on the plan pages fold away, as plain DOM for the map card. */
function airportBlock(locale: Locale, s: ReturnType<typeof strings>, routes: AirportRoutes, walkMinutes: number): HTMLElement {
  const stop = (x: AirportLeg['from']) => `${x.code ? x.code + ' ' : ''}${t(x.name, locale)}`
  const lineName = (leg: AirportLeg) => (leg.line.toLowerCase().includes(leg.system.toLowerCase()) || leg.system === 'ARL' ? leg.line : `${leg.system} ${leg.line}`)
  const sentence = (legs: AirportLeg[] | null) => {
    if (!legs) return s.airport.noRail
    if (legs.length === 0) return s.airport.sameStation
    return `${legs.map((leg, i) => (i === 0 ? s.airport.ride(lineName(leg), stop(leg.to)) : s.airport.change(stop(leg.from), lineName(leg), stop(leg.to)))).join(', ')}, ${s.airport.thenWalk(walkMinutes)}`
  }
  const d = document.createElement('details')
  d.className = 'tm-airport tm-card__airport'
  const sum = document.createElement('summary')
  sum.className = 'tm-airport__summary'
  sum.textContent = s.airport.summary
  d.append(sum)
  for (const [label, legs] of [[s.airport.suvarnabhumi, routes.suvarnabhumi], [s.airport.donMueang, routes.donMueang]] as const) {
    const p = document.createElement('p')
    p.className = 'tm-airport__line'
    const b = document.createElement('strong')
    b.textContent = label
    p.append(b, ` ${sentence(legs)}`)
    d.append(p)
  }
  const note = document.createElement('p')
  note.className = 'tm-airport__note'
  note.textContent = s.airport.note
  d.append(note)
  return d
}

export function cardElement(locale: Locale, cityId: string, pin: Pin, area: Area, station: Station | undefined, nearby: NearbyPin[], onClose: () => void, onPick: (pin: Pin) => void, airport?: AirportRoutes, elsewhere?: { hotel: Pin; legs: AirportLeg[] }): HTMLElement {
  const s = strings(locale)
  const el = document.createElement('div')
  el.className = 'tm-card'
  el.style.setProperty('--pin', `var(--${area.color})`)
  const photos = pin.photos?.length ? pin.photos : pin.photo ? [pin.photo] : []
  if (photos.length > 0) el.append(photoSlider(photos, s))
  const head = document.createElement('div')
  head.className = 'tm-card__head'
  const kind = document.createElement('span')
  kind.className = 'tm-card__kind'
  kind.textContent = pin.tier ? `${s.pin[pin.kind]} · ${s.filters.tier[pin.tier]}` : s.pin[pin.kind]
  // The price lines go under the "why" line (built below); `after` on a node
  // not yet in the card did nothing, so the popup never showed a price before.
  const priceLines: HTMLElement[] = []
  if (pin.price) {
    const price = document.createElement('p')
    price.className = 'tm-card__price'
    price.textContent = s.guide.priceFrom(thb(pin.price.from, locale)) + (pin.price.basis === 'tier-estimate' ? ` (${s.guide.priceEstimate})` : '')
    priceLines.push(price)
    const stay = stayNow()
    if (stay) {
      const total = document.createElement('p')
      total.className = 'tm-card__price tm-card__stay'
      total.textContent = s.guide.stayTotal(thb(pin.price.from * nights(stay), locale), nights(stay))
      priceLines.push(total)
    }
  }
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'tm-card__close'
  close.setAttribute('aria-label', s.card.close)
  close.textContent = '×'
  close.addEventListener('click', onClose)
  // The heart: the same shortlist as the list rows, so a card on the map can save too.
  const save = document.createElement('button')
  save.type = 'button'
  const paint = () => {
    const on = savedIds().includes(pin.id)
    save.className = `tm-save tm-card__save${on ? ' tm-save--on' : ''}`
    save.setAttribute('aria-label', on ? s.saved.remove : s.saved.save)
    save.setAttribute('aria-pressed', String(on))
    save.title = on ? s.saved.remove : s.saved.save
  }
  save.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'
  paint()
  save.addEventListener('click', () => { toggleSaved(pin.id); paint() })
  const tools = document.createElement('span')
  tools.className = 'tm-card__tools'
  tools.append(save, close)
  head.append(kind, tools)
  const name = document.createElement('p')
  name.className = 'tm-card__name'
  name.textContent = t(pin.name, locale)
  const why = document.createElement('p')
  why.className = 'tm-card__why'
  why.textContent = t(pin.why, locale)
  el.append(head, name, why, ...priceLines)
  const when = whenLine(pin, locale)
  if (when) {
    const line = document.createElement('p')
    line.className = 'tm-card__when'
    line.textContent = when
    el.append(line)
  }
  if (pin.walk && station) {
    const walk = document.createElement('p')
    walk.className = 'tm-card__walk'
    walk.textContent = `${s.city.walkMinutes(pin.walk.minutes)} ${s.city.from(`${station.code ? station.code + ' ' : ''}${t(station.name, locale)}`)}`
    el.append(walk)
    if (pin.kind === 'hotel' && airport) el.append(airportBlock(locale, s, airport, pin.walk.minutes))
  }
  // A place also says how far it is from the reader's hotel in this area (the chosen one, else the first saved), as the plan pages do; its Directions then start at that door.
  let fromDoor: Pin | undefined
  let byTrain = false
  if (pin.kind !== 'hotel') {
    const saved = savedIds()
    const hotels = area.pins.filter((p) => p.kind === 'hotel' && saved.includes(p.id))
    const chosen = myHotelChoice(area.id)
    const mine = hotels.find((h) => h.id === chosen) ?? hotels[0]
    if (mine) {
      fromDoor = mine
      const from = document.createElement('p')
      from.className = 'tm-card__walk tm-card__from'
      from.textContent = s.weekendPage.fromHotel(Math.max(1, Math.round(distanceM(mine.location.lon, mine.location.lat, pin.location.lon, pin.location.lat) / WALK_PACE_M_PER_MIN)), t(mine.name, locale))
      el.append(from)
    } else if (elsewhere && pin.walk) {
      // The hotel is in another area: the ride from its station, then the walk from this one.
      fromDoor = elsewhere.hotel
      byTrain = true
      const from = document.createElement('p')
      from.className = 'tm-card__walk tm-card__from'
      from.textContent = s.weekendPage.byTrainFrom(t(elsewhere.hotel.name, locale), rideSentence(elsewhere.legs, pin.walk.minutes, locale))
      el.append(from)
    }
  }
  // A saved hotel, where the area has more than one saved: say when it is the one the plan walks from.
  if (pin.kind === 'hotel') {
    const saved = savedIds()
    const hotels = area.pins.filter((p) => p.kind === 'hotel' && saved.includes(p.id))
    if (hotels.length > 1) {
      const chosen = myHotelChoice(area.id)
      const mine = hotels.find((h) => h.id === chosen) ?? hotels[0]
      if (mine.id === pin.id) {
        const tag = document.createElement('p')
        tag.className = 'tm-card__walk tm-card__from'
        tag.textContent = s.saved.yourPick(t(area.name, locale))
        el.append(tag)
      }
    }
  }
  const partners = Object.keys(pin.links) as Partner[]
  {
    const links = document.createElement('div')
    links.className = 'tm-card__links'
    const go = document.createElement('a')
    go.className = 'tm-card__link tm-card__link--quiet'
    go.href = fromDoor ? directionsUrl(pin.location.lat, pin.location.lon, { from: fromDoor.location, mode: byTrain ? 'transit' : 'walking' }) : directionsUrl(pin.location.lat, pin.location.lon)
    go.target = '_blank'
    go.rel = 'noopener'
    go.textContent = fromDoor ? s.trip.directionsFrom(t(fromDoor.name, locale)) : s.card.directions
    links.append(go)
    for (const partner of partners) {
      const a = document.createElement('a')
      a.className = partner === 'official' ? 'tm-card__link tm-card__link--quiet' : 'tm-card__link'
      const subId = subIdFor(`${cityId}-${area.id}`, pin.id)
      a.href = buildOutboundUrl(partner, pin.links[partner]!, subId, stayNow())
      if (partner !== 'official') a.addEventListener('click', () => trackOutbound(partner, subId))
      a.target = '_blank'
      a.rel = partner === 'official' ? 'noopener' : 'noopener sponsored'
      a.textContent = partner === 'official' ? s.card.official : s.card.open(partner.charAt(0).toUpperCase() + partner.slice(1))
      links.append(a)
    }
    if (pin.kind === 'hotel') {
      // A hotel leads to the weekend plan built around it: the stops say how far they are from this hotel on foot.
      const plan = document.createElement('a')
      plan.className = 'tm-card__link tm-card__link--quiet'
      plan.href = `/${locale}/${cityId}/weekend/${area.id}?hotel=${pin.id}`
      plan.textContent = s.card.planWeekend
      // Taking the plan from a saved hotel also makes it the one the other pages walk from.
      plan.addEventListener('click', () => { if (savedIds().includes(pin.id)) chooseHotel(area.id, pin.id) })
      links.append(plan)
    }
    el.append(links)
  }
  if (nearby.length > 0) {
    const tip = document.createElement('div')
    tip.className = 'tm-card__nearby'
    const title = document.createElement('p')
    title.className = 'tm-card__nearby-title'
    title.textContent = s.card.nearby
    const list = document.createElement('ul')
    for (const n of nearby) {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'tm-card__nearby-row'
      b.style.setProperty('--pin', `var(--${n.area.color})`)
      const dot = document.createElement('span')
      dot.className = 'tm-card__nearby-dot'
      const name = document.createElement('span')
      name.className = 'tm-card__nearby-name'
      name.textContent = t(n.pin.name, locale)
      const mins = document.createElement('span')
      mins.className = 'tm-card__nearby-min'
      mins.textContent = s.card.nearbyWalk(n.minutes)
      b.append(dot, name, mins)
      b.addEventListener('click', () => onPick(n.pin))
      li.append(b)
      list.append(li)
    }
    tip.append(title, list)
    el.append(tip)
  }
  return el
}

