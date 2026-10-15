/**
 * The one place keys are read. Phase 1 needs none: the map, tiles and
 * content all work with no credentials. Values arrive later via Vercel
 * env vars; absence must degrade (plain links, no analytics), never crash.
 */
export const env = {
  /** Travelpayouts marker. Absent: hotel links go to the plain destination URL. */
  travelpayoutsMarker: process.env.NEXT_PUBLIC_TP_MARKER ?? '',
  /** Plausible domain. Absent: no analytics script is rendered. */
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? '',
  /** The site's public address for the sitemap and canonical links. The Vercel address until the domain is connected (docs/pre-launch.md). */
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://thaimapped.vercel.app').replace(/\/$/, ''),
} as const
