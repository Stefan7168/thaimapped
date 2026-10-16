/*
 * ThaiMapped service worker: the pages you opened stay readable without a
 * signal, so a weekend plan, a trip or the saved list opens on the train or
 * on a roaming phone. Online, nothing changes: every page and data request
 * goes to the network first and only its fresh answer is kept. Offline, the
 * last copy of a page you opened is served; a page never opened gets a
 * short note. Static files (scripts, fonts, photos, the map style) are kept
 * as they come, since their names change with every build.
 */
const VERSION = 'v1'
const STATIC = `static-${VERSION}`
const PAGES = `pages-${VERSION}`
const PAGE_LIMIT = 80

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

const isStatic = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/_next/image') || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/photos/') || url.pathname.startsWith('/map/') || /\.(svg|png|ico|woff2?)$/.test(url.pathname)

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key)
}

const offlineNote = () =>
  new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ThaiMapped</title><body style="font-family:system-ui;background:#f6f4ee;color:#1f1d1a;margin:0;padding:48px 24px;line-height:1.5"><h1 style="font-size:22px;margin:0 0 8px">No signal right now</h1><p style="margin:0 0 16px">The pages you opened before are still here. This one was never opened on this phone.</p><p><a href="/en/saved" style="color:#b8452c">Your saved list</a> · <a href="/en" style="color:#b8452c">Home</a></p></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      }),
    )
    return
  }
  // Pages and their data: the network first, the last copy only without it.
  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGES)
      try {
        const res = await fetch(req)
        if (res.ok) {
          cache.put(req, res.clone())
          trim(PAGES, PAGE_LIMIT)
        }
        return res
      } catch {
        const hit = await cache.match(req)
        if (hit) return hit
        return req.mode === 'navigate' ? offlineNote() : Response.error()
      }
    })(),
  )
})
