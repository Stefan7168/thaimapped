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
} as const
