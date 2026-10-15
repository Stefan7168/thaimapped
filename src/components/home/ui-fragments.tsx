import type { Area, Line, Locale, Pin, RouteStop, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { STOP_COLORS } from '@/components/map/trip-map'

/**
 * Cropped fragments of the product's own interface, built in HTML at true
 * size with real content from the JSON. Each root carries data-ui, so the
 * fragment keeps the product's own borders and radii.
 */

export function StationFragment({ locale, stations, lines, active }: { locale: Locale; stations: Station[]; lines: Line[]; active: Station }) {
  const s = strings(locale)
  const colour = (st: Station) => lines.find((l) => l.system === st.system && l.line === st.line)?.color ?? '#6f6a5f'
  return (
    <div data-ui className="tm-ui">
      <div className="tm-ui__head">
        <span className="tm-ui__title">{s.filters.transit}</span>
        <span className="tm-ui__search">{s.filters.transitSearch}</span>
      </div>
      <ul className="tm-ui__rows">
        {stations.map((st) => (
          <li key={st.id} className={`tm-ui__row${st.id === active.id ? ' tm-ui__row--on' : ''}`}>
            <span className="tm-ui__check" aria-hidden="true" />
            <span className="tm-ui__code" style={{ background: colour(st) }}>{st.code}</span>
            <span className="tm-ui__name">{t(st.name, locale)}</span>
            <span className="tm-ui__sub">{st.system} {st.line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HotelFragment({ locale, pin, area, station }: { locale: Locale; pin: Pin; area: Area; station: Station | null }) {
  const s = strings(locale)
  const partners = Object.keys(pin.links)
  return (
    <div data-ui className="tm-ui tm-ui--card" style={{ ['--pin' as string]: `var(--${area.color})` }}>
      <div className="tm-ui__pin">
        <span className="tm-ui__dot" aria-hidden="true" />
        <span className="tm-ui__kind">{s.pin[pin.kind]}</span>
        {pin.tier && <span className="tm-ui__tier">{s.filters.tier[pin.tier]}</span>}
      </div>
      <p className="tm-ui__hotel">{t(pin.name, locale)}</p>
      {pin.walk && station && <p className="tm-ui__walk">{s.home.fragments.hotelWalk(pin.walk.minutes, t(station.name, locale))}</p>}
      <p className="tm-ui__why">{t(pin.why, locale)}</p>
      <div className="tm-ui__links">
        {(partners.length ? partners : ['agoda', 'booking']).map((p) => (
          <span key={p} className="tm-ui__link">{p}</span>
        ))}
      </div>
    </div>
  )
}

export function TripStopsFragment({ locale, stops, activeId }: { locale: Locale; stops: RouteStop[]; activeId: string }) {
  const s = strings(locale)
  return (
    <div data-ui className="tm-ui">
      <div className="tm-ui__head">
        <span className="tm-ui__title">{s.home.fragments.tripRowTitle}</span>
      </div>
      <ol className="tm-ui__rows">
        {stops.map((stop, i) => (
          <li key={stop.id} className={`tm-ui__row tm-ui__row--stop${stop.id === activeId ? ' tm-ui__row--on' : ''}`}>
            <span className="tm-ui__num" style={{ background: STOP_COLORS[stop.kind] }}>{i + 1}</span>
            <span className="tm-ui__stopkind">{s.stop[stop.kind]}</span>
            <span className="tm-ui__name">{t(stop.name, locale)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
