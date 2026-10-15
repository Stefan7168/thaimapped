/**
 * Dynamic loader for maplibre-gl with the self-hosted worker URL set once.
 * v6's worker auto-detection returns '' under Turbopack, so every bundled
 * consumer must call setWorkerUrl() before the first map. The worker and
 * its sibling chunk are copied by scripts/copy-maplibre-worker.mjs.
 */
let workerUrlConfigured = false

export async function loadMaplibreGl() {
  const maplibregl = await import('maplibre-gl')
  if (!workerUrlConfigured) {
    maplibregl.setWorkerUrl('/vendor/maplibre-gl/maplibre-gl-worker.mjs')
    workerUrlConfigured = true
  }
  return maplibregl
}
