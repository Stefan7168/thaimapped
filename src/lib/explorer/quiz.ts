import type { Area } from '@/lib/content/types'
import type { Tier } from './filters'

/** The three questions, each answer a set of the `fits` tags it stands for. */
export const QUIZ_PURPOSES = ['first-time', 'nightlife', 'food', 'shopping', 'culture', 'romantic', 'quiet'] as const
export type Purpose = (typeof QUIZ_PURPOSES)[number]
export const QUIZ_PACES = { lively: ['nightlife', 'first-time', 'shopping', 'food'], calm: ['quiet', 'local', 'culture', 'romantic'] } as const
export type Pace = keyof typeof QUIZ_PACES

export interface QuizAnswers {
  purpose: Purpose | null
  tier: Tier | null
  pace: Pace | null
}

export interface QuizResult {
  area: Area
  score: number
  /** The area's hotel in the chosen tier, if it has one. */
  hotel: Area['pins'][number] | null
}

/**
 * Scores every area against the answers and returns them best first. Purpose
 * counts most, pace next, and having a hotel in the chosen tier breaks ties.
 * Deterministic: the same answers always give the same order.
 */
export function rankAreas(areas: Area[], a: QuizAnswers): QuizResult[] {
  return areas
    .map((area) => {
      let score = 0
      if (a.purpose && area.fits.includes(a.purpose)) score += 3
      if (a.pace) score += QUIZ_PACES[a.pace].filter((tag) => area.fits.includes(tag)).length
      const hotel = a.tier ? (area.pins.find((p) => p.kind === 'hotel' && p.tier === a.tier) ?? null) : null
      if (a.tier && hotel) score += 1
      return { area, score, hotel }
    })
    .sort((x, y) => y.score - x.score)
}
