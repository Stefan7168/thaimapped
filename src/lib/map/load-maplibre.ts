/**
 * Dynamic loader for maplibre-gl with the self-hosted worker URL set once.
 * v6's worker auto-detection returns '' under Turbopack, so every bundled
 * consumer must call setWorkerUrl() before the first map. The worker and
 * its sibling chunk are copied by scripts/copy-maplibre-worker.mjs.
 */
let workerUrlConfigured = false
let firstLoad = true

// The library is about 290 KB gzipped. The first page load lets the text and
// photos paint before fetching it; later calls resolve at once from the cache.
function afterFirstPaint(): Promise<void> {
  if (!firstLoad || typeof window === 'undefined') return Promise.resolve()
  firstLoad = false
  return new Promise((resolve) => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number }).requestIdleCallback
    if (idle) idle(() => resolve(), { timeout: 1200 })
    else setTimeout(resolve, 250)
  })
}

export async function loadMaplibreGl() {
  await afterFirstPaint()
  const maplibregl = await import('maplibre-gl')
  if (!workerUrlConfigured) {
    maplibregl.setWorkerUrl('/vendor/maplibre-gl/maplibre-gl-worker.mjs')
    workerUrlConfigured = true
  }
  return maplibregl
}
