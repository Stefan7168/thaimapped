import type { Area, Locale, Pin, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { whenLine } from '@/lib/explorer/when'
import { strings } from '@/lib/i18n/strings'
import { thb } from '@/lib/explorer/price'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { trackOutbound } from '@/lib/links/track'
import type { NearbyPin } from '@/lib/explorer/filters'

/** The card that opens on a pin: what it is, why it is here, how far from the train, where to book. */
export function cardElement(locale: Locale, cityId: string, pin: Pin, area: Area, station: Station | undefined, nearby: NearbyPin[], onClose: () => void, onPick: (pin: Pin) => void): HTMLElement {
  const s = strings(locale)
  const el = document.createElement('div')
  el.className = 'tm-card'
  el.style.setProperty('--pin', `var(--${area.color})`)
  if (pin.photo) {
    const fig = document.createElement('figure')
    fig.className = 'tm-card__photo'
    const img = document.createElement('img')
    // The optimiser serves a 640 px copy: the card is 300 px wide and the file is 1600 px.
    img.src = `/_next/image?url=${encodeURIComponent(pin.photo.src)}&w=640&q=75`
    img.alt = pin.photo.alt
    img.loading = 'lazy'
    const cap = document.createElement('figcaption')
    const credit = document.createElement('a')
    credit.href = pin.photo.source
    credit.target = '_blank'
    credit.rel = 'noopener'
    credit.textContent = pin.photo.credit
    cap.append(credit, ` (${pin.photo.licence})`)
    fig.append(img, cap)
    el.append(fig)
  }
  const head = document.createElement('div')
  head.className = 'tm-card__head'
  const kind = document.createElement('span')
  kind.className = 'tm-card__kind'
  kind.textContent = pin.tier ? `${s.pin[pin.kind]} · ${s.filters.tier[pin.tier]}` : s.pin[pin.kind]
  if (pin.price) {
    const price = document.createElement('p')
    price.className = 'tm-card__price'
    price.textContent = s.guide.priceFrom(thb(pin.price.from, locale)) + (pin.price.basis === 'tier-estimate' ? ` (${s.guide.priceEstimate})` : '')
    kind.after(price)
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
  el.append(head, name, why)
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
      a.href = buildOutboundUrl(partner, pin.links[partner]!, subId)
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

