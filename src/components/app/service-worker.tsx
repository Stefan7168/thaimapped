'use client'

import { useEffect } from 'react'

/** Registers the service worker (public/sw.js) once the page is live, in production only: pages opened stay readable without a signal. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* No worker: the site works as before. */ }) }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])
  return null
}
