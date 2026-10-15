import type { Area, AreaPhoto, Locale, Pin, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { whenLine } from '@/lib/explorer/when'
import { strings } from '@/lib/i18n/strings'
import { thb } from '@/lib/explorer/price'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { nights, stayNow } from '@/lib/stay/store'
import { trackOutbound } from '@/lib/links/track'
import type { NearbyPin } from '@/lib/explorer/filters'

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
export function cardElement(locale: Locale, cityId: string, pin: Pin, area: Area, station: Station | undefined, nearby: NearbyPin[], onClose: () => void, onPick: (pin: Pin) => void): HTMLElement {
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
  head.append(kind, close)
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
  }
  const partners = Object.keys(pin.links) as Partner[]
  if (partners.length > 0) {
    const links = document.createElement('div')
    links.className = 'tm-card__links'
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

