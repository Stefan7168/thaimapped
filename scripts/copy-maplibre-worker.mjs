#!/usr/bin/env node
// Self-hosts the maplibre-gl v6 background worker under public/vendor.
//
// v6's worker script does `import "./maplibre-gl-shared.mjs"`, a hardcoded
// relative import. Turbopack copies only the one referenced file to a hashed
// path, so the worker 404s on its sibling at runtime. Copying both files
// under their original names and pointing setWorkerUrl at the copy is the
// fix MapLibre's own bundler docs recommend.
//
// Runs as postinstall AND at the start of `dev` and `build`: a cached
// node_modules restore (Vercel) skips lifecycle scripts while public/vendor
// (gitignored) comes from a fresh clone. Adapted from Stefan7168/glaibaan
// scripts/copy-maplibre-worker.mjs (same author).

import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromRoot = createRequire(join(root, 'package.json'))
const maplibreDist = dirname(requireFromRoot.resolve('maplibre-gl/dist/maplibre-gl.mjs'))
const destDir = join(root, 'public', 'vendor', 'maplibre-gl')

mkdirSync(destDir, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  const src = join(maplibreDist, file)
  if (!existsSync(src)) {
    throw new Error(`copy-maplibre-worker: expected ${src} to exist (maplibre-gl layout changed?)`)
  }
  copyFileSync(src, join(destDir, file))
}
console.log('[copy-maplibre-worker] synced worker + shared chunk to public/vendor/maplibre-gl')
