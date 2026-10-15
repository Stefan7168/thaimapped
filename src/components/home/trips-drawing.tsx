import type { Locale, TripRoute } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { STOP_COLORS } from '@/components/map/trip-map'

/** One colour per trip on the drawing and in the list beside it. */
export const TRIP_COLORS = ['var(--area-1)', 'var(--area-4)', 'var(--area-3)', 'var(--area-2)', 'var(--area-5)', 'var(--area-7)']

const W = 720
const H = 640
const PAD = 72

/**
 * The four trips drawn from their real waypoints on one sheet: Bangkok at the
 * bottom, the roads north and north-east. Equirectangular, no base map, so
 * the drawing claims nothing the content does not hold.
 */
export function TripsDrawing({ locale, routes, cityName, cityCenter }: { locale: Locale; routes: TripRoute[]; cityName: string; cityCenter: [number, number] }) {
  const pts = routes.flatMap((r) => r.path ?? r.waypoints)
  pts.push(cityCenter)
  const lons = pts.map((p) => p[0])
  const lats = pts.map((p) => p[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180))
  const spanX = (maxLon - minLon) * kx || 1
  const spanY = maxLat - minLat || 1
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY)
  const ox = (W - spanX * scale) / 2
  const oy = (H - spanY * scale) / 2
  const x = (lon: number) => ox + (lon - minLon) * kx * scale
  const y = (lat: number) => oy + (maxLat - lat) * scale

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={routes.map((r) => t(r.name, locale)).join(', ')} className="tm-trips-drawing">
      {routes.map((r, i) => {
        const line = r.path ?? r.waypoints
        const d = line.map(([lon, lat], j) => `${j === 0 ? 'M' : 'L'}${x(lon).toFixed(1)} ${y(lat).toFixed(1)}`).join(' ')
        return (
          <g key={r.id} style={{ color: TRIP_COLORS[i % TRIP_COLORS.length] }}>
            <path d={d} fill="none" stroke="currentColor" strokeWidth={r.distanceKm && r.distanceKm > 50 ? 8 : 14} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={r.path ? undefined : '14 12'} />
            {r.stops.map((stop) => {
              const cx = x(stop.location.lon), cy = y(stop.location.lat)
              if (stop.kind === 'hotel') return <rect key={stop.id} x={cx - 10} y={cy - 10} width={20} height={20} fill={STOP_COLORS.hotel} stroke="var(--paper)" strokeWidth={3} />
              if (stop.kind === 'start' || stop.kind === 'end') return null
              return <circle key={stop.id} cx={cx} cy={cy} r={8} fill={STOP_COLORS[stop.kind] ?? 'currentColor'} stroke="var(--paper)" strokeWidth={3} />
            })}
          </g>
        )
      })}
      <circle cx={x(cityCenter[0])} cy={y(cityCenter[1])} r={14} fill="var(--paper)" stroke="var(--ink)" strokeWidth={4} />
      <text x={x(cityCenter[0]) + 20} y={y(cityCenter[1]) + 6} className="tm-trips-drawing__label">{cityName}</text>
    </svg>
  )
}
