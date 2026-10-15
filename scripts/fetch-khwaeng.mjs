#!/usr/bin/env node
// Fetches the sub-districts (khwaeng, admin_level 8) of central Bangkok from
// OpenStreetMap through the Overpass API and writes them as GeoJSON polygons
// to content/sources/bangkok-khwaeng.geojson. Data © OpenStreetMap
// contributors, ODbL. Needs network access, so it runs from a machine that
// can reach overpass-api.de, not from a sandboxed session.
// Usage: node scripts/fetch-khwaeng.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Central Bangkok, generous: south, west, north, east.
const BBOX = '13.62,100.44,13.84,100.66'
const QUERY = `[out:json][timeout:180];rel["boundary"="administrative"]["admin_level"="8"](${BBOX});out geom;`
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'sources', 'bangkok-khwaeng.geojson')

// Overpass refuses a bare "node" user agent (406) and answers 429/502/503/504 under load.
async function query(attempt = 1) {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(QUERY),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'thaimapped-fetch/1.0 (github.com/Stefan7168/thaimapped)' },
  })
  if (res.ok) return res.json()
  const body = (await res.text()).slice(0, 300)
  if ([429, 502, 503, 504].includes(res.status) && attempt < 4) {
    console.error(`overpass ${res.status}, retrying in 30 s (attempt ${attempt} of 3)`)
    await new Promise((r) => setTimeout(r, 30_000))
    return query(attempt + 1)
  }
  throw new Error(`overpass ${res.status}: ${body}`)
}
const data = await query()

const round = (n) => Math.round(n * 1e5) / 1e5
const key = (p) => `${p[0]},${p[1]}`

/** Joins way segments end to end into closed rings. */
function rings(ways) {
  const segs = ways.map((w) => w.geometry.map((p) => [round(p.lon), round(p.lat)]))
  const result = []
  while (segs.length) {
    let ring = segs.shift()
    let grew = true
    while (grew && key(ring[0]) !== key(ring[ring.length - 1])) {
      grew = false
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        const tail = key(ring[ring.length - 1])
        if (key(s[0]) === tail) ring = ring.concat(s.slice(1))
        else if (key(s[s.length - 1]) === tail) ring = ring.concat(s.slice(0, -1).reverse())
        else continue
        segs.splice(i, 1)
        grew = true
        break
      }
    }
    if (key(ring[0]) !== key(ring[ring.length - 1])) throw new Error('open ring')
    result.push(ring)
  }
  return result
}

const features = []
for (const rel of data.elements.filter((e) => e.type === 'relation')) {
  const members = rel.members.filter((m) => m.type === 'way' && m.geometry)
  let outer, inner
  try {
    outer = rings(members.filter((m) => m.role !== 'inner'))
    inner = rings(members.filter((m) => m.role === 'inner'))
  } catch (e) {
    console.error(`skip relation ${rel.id} (${rel.tags?.['name:en'] ?? rel.tags?.name}): ${e.message}`)
    continue
  }
  // One polygon per outer ring; every inner ring goes to the first polygon
  // (central Bangkok sub-districts have no holes, so this is a formality).
  const coordinates = outer.map((o, i) => (i === 0 ? [o, ...inner] : [o]))
  features.push({
    type: 'Feature',
    properties: { osmId: rel.id, name: rel.tags?.name ?? '', nameEn: rel.tags?.['name:en'] ?? '', adminLevel: 8 },
    geometry: { type: 'MultiPolygon', coordinates },
  })
}
features.sort((a, b) => a.properties.nameEn.localeCompare(b.properties.nameEn))
const fc = {
  type: 'FeatureCollection',
  properties: { source: 'OpenStreetMap via Overpass API', licence: 'ODbL 1.0', query: QUERY, fetched: new Date().toISOString().slice(0, 10) },
  features,
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(fc) + '\n')
console.log(`${features.length} sub-districts -> ${out}`)
for (const f of features) console.log(`  ${f.properties.nameEn || '(no name:en)'} / ${f.properties.name}`)
