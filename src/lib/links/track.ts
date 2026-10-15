import type { Partner } from './build'

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string> }) => void
  }
}

/** Records a hotel or tour click. Plausible is only loaded when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set; otherwise this is a no-op. */
export function trackOutbound(partner: Partner, subId: string): void {
  if (typeof window === 'undefined') return
  window.plausible?.('outbound_click', { props: { partner, sub_id: subId } })
}
