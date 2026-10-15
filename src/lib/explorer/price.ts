import type { Locale } from '@/lib/content/types'
import { THB_PER_USD } from './filters'

/** "฿1,500" in the locale's digits. */
export const thb = (n: number, locale: Locale) => `฿${new Intl.NumberFormat(locale).format(n)}`
/** "$42", rounded, from a THB amount; a rough companion figure only. */
export const usd = (thbAmount: number, locale: Locale) => `$${new Intl.NumberFormat(locale).format(Math.round(thbAmount / THB_PER_USD))}`
