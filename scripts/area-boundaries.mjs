#!/usr/bin/env node
// Builds content/boundaries/<area>.geojson: the outline of each area as the
// union of the Bangkok districts (khet) it sits in. The shapes are never
// drawn by hand. They come from geoBoundaries (gbOpen, THA ADM2, built from
// Royal Thai Survey Department data via OCHA, CC BY 3.0 IGO):
//   https://github.com/wmgeolab/geoBoundaries/tree/main/releaseData/gbOpen/THA/ADM2
// Usage: node scripts/area-boundaries.mjs <geoBoundaries-THA-ADM2.geojson>
// The source file is 265 MB (one feature per line) and stays out of the repo.
import { createReadStream, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { union } from 'polyclip-ts'

/**
 * Which districts make up each area. Where an area is a district, the line is
 * that district's border. Where an area is a neighbourhood that spans
 * districts, the line is the border of the districts it sits in, so two
 * areas can share a district (Silom and Riverside share Bang Rak; Sukhumvit
 * and Thonglor-Ekkamai share Vadhana).
 */
const AREAS = {
  'old-town': ['Phra Nakhon'],
  chinatown: ['Samphanthawong'],
  silom: ['Bang Rak', 'Sathon'],
  riverside: ['Bang Rak', 'Khlong San'],
  siam: ['Pathum Wan', 'Ratchathewi'],
  sukhumvit: ['Vadhana', 'Khlong Toei'],
  'thonglor-ekkamai': ['Vadhana', 'Phra Khanong'],
  ari: ['Phaya Thai'],
}

const SOURCE = 'geoBoundaries gbOpen THA ADM2 (Royal Thai Survey Department via OCHA ROAP, boundaries of 2019), CC BY 3.0 IGO'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/area-boundaries.mjs <geoBoundaries-THA-ADM2.geojson>')
  process.exit(1)
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'boundaries')
const wanted = new Set(Object.values(AREAS).flat())
const found = new Map()

const rl = createInterface({ input: createReadStream(src, { encoding: 'utf8' }) })
for await (const line of rl) {
  const m = line.match(/"shapeName": "([^"]+)"/)
  if (!m || !wanted.has(m[1])) continue
  const feature = JSON.parse(line.replace(/,\s*$/, ''))
  if (found.has(m[1])) throw new Error(`district ${m[1]} appears twice in the source`)
  found.set(m[1], feature.geometry)
}
for (const name of wanted) if (!found.has(name)) throw new Error(`district ${name} not found in ${src}`)

const round = (n) => Math.round(n * 1e5) / 1e5
const asMulti = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates])

for (const [areaId, districts] of Object.entries(AREAS)) {
  const merged = union(...districts.map((d) => asMulti(found.get(d))))
  const coordinates = merged.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => [round(lon), round(lat)])))
  const feature = {
    type: 'Feature',
    properties: { area: areaId, districts, source: SOURCE },
    geometry: { type: 'MultiPolygon', coordinates },
  }
  writeFileSync(join(out, `${areaId}.geojson`), JSON.stringify(feature) + '\n')
  const points = coordinates.reduce((n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0), 0)
  console.log(`${areaId}: ${districts.join(' + ')} -> ${coordinates.length} polygon(s), ${points} points`)
}
