#!/usr/bin/env node
// Fetches the real shape of a place from OpenStreetMap through the Overpass
// API: a street's road stretch (MultiLineString) or a zone's area such as a
// market (MultiPolygon). Writes content/shapes/<area>/<pin>.geojson, one file
// per entry in SHAPES below. Data © OpenStreetMap contributors, ODbL. Needs
// network access, so it runs from a machine that can reach overpass-api.de.
// Usage: node scripts/fetch-place-shapes.mjs [pin-id ...]   (no ids = all)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Which OSM objects make each place. `query` is the Overpass selector
 * (without the trailing bbox), `bbox` is south,west,north,east and keeps
 * same-named roads elsewhere in the city out. Verified by eye on the map
 * after fetching; a wrong match is a data bug, so say so in docs.
 */
const SHAPES = [
  { area: 'chinatown', pin: 'yaowarat-road', kind: 'street', query: 'way["highway"]["name:en"="Yaowarat Road"]', bbox: '13.735,100.505,13.745,100.518' },
  { area: 'old-town', pin: 'khao-san-road', kind: 'street', query: 'way["highway"]["name:en"="Khao San Road"]', bbox: '13.756,100.494,13.762,100.502' },
  { area: 'silom', pin: 'patpong-night-market', kind: 'street', query: 'way["highway"]["name:en"~"^Patpong( Road)? ?[12]?$"]', bbox: '13.727,100.531,13.732,100.536' },
  { area: 'ari', pin: 'chatuchak-market', kind: 'zone', query: 'wr["amenity"="marketplace"]["name:en"~"Chatuchak"]', bbox: '13.795,100.545,13.805,100.555' },
]

async function overpass(query, attempt = 1) {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'thaimapped-fetch/1.0 (github.com/Stefan7168/thaimapped)' },
  })
  if (res.ok) return res.json()
  const body = (await res.text()).slice(0, 300)
  if ([429, 502, 503, 504].includes(res.status) && attempt < 4) {
    console.error(`overpass ${res.status}, retrying in 30 s (attempt ${attempt} of 3)`)
    await new Promise((r) => setTimeout(r, 30_000))
    return overpass(query, attempt + 1)
  }
  throw new Error(`overpass ${res.status}: ${body}`)
}

const round = (n) => Math.round(n * 1e5) / 1e5
const key = (p) => `${p[0]},${p[1]}`

/** Joins way segments end to end into closed rings (same as fetch-khwaeng). */
function rings(ways) {
  const segs = ways.map((w) => w.geometry.map((p) => [round(p.lon), round(p.lat)]))
  const out = []
  while (segs.length) {
    const ring = segs.shift()
    let grew = true
    while (grew && key(ring[0]) !== key(ring[ring.length - 1])) {
      grew = false
      for (let i = 0; i < segs.length; i++) {
        const sgm = segs[i]
        const end = key(ring[ring.length - 1])
        if (key(sgm[0]) === end) ring.push(...sgm.slice(1))
        else if (key(sgm[sgm.length - 1]) === end) ring.push(...sgm.slice(0, -1).reverse())
        else continue
        segs.splice(i, 1)
        grew = true
        break
      }
    }
    if (key(ring[0]) !== key(ring[ring.length - 1])) ring.push(ring[0])
    out.push(ring)
  }
  return out
}

function geometryFor(kind, elements) {
  const ways = elements.filter((e) => e.type === 'way' && e.geometry)
  if (kind === 'street') {
    return { type: 'MultiLineString', coordinates: ways.map((w) => w.geometry.map((p) => [round(p.lon), round(p.lat)])) }
  }
  const polys = []
  for (const rel of elements.filter((e) => e.type === 'relation')) {
    const outer = rings(rel.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry))
    const inner = rings(rel.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry))
    for (const o of outer) polys.push([o, ...inner])
  }
  const inRel = new Set(elements.filter((e) => e.type === 'relation').flatMap((r) => r.members.map((m) => m.ref)))
  for (const r of rings(ways.filter((w) => !inRel.has(w.id)))) polys.push([r])
  return { type: 'MultiPolygon', coordinates: polys }
}

const wanted = new Set(process.argv.slice(2))
for (const s of SHAPES) {
  if (wanted.size && !wanted.has(s.pin)) continue
  const q = `[out:json][timeout:60];${s.query}(${s.bbox});out geom;`
  const data = await overpass(q)
  const geometry = geometryFor(s.kind, data.elements)
  const n = geometry.coordinates.length
  if (!n) {
    console.error(`${s.pin}: nothing matched ${s.query} in ${s.bbox}`)
    continue
  }
  const feature = {
    type: 'Feature',
    properties: { area: s.area, pin: s.pin, kind: s.kind, osmIds: data.elements.map((e) => `${e.type}/${e.id}`), source: 'OpenStreetMap contributors, ODbL (Overpass API)' },
    geometry,
  }
  const out = join(root, 'content', 'shapes', s.area, `${s.pin}.geojson`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(feature) + '\n')
  console.log(`${s.pin}: ${s.kind}, ${n} part(s), ${data.elements.length} OSM object(s) -> content/shapes/${s.area}/${s.pin}.geojson`)
  console.log(`  add to content/areas/${s.area}.json pin ${s.pin}: "shape": { "kind": "${s.kind}", "path": "shapes/${s.area}/${s.pin}.geojson" }`)
}
