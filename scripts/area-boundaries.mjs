#!/usr/bin/env node
// Builds the outlines the explorer draws:
//   content/boundaries/<area>/<subarea>.geojson  one per sub-area
//   content/boundaries/<area>.geojson            the area, as the union of its sub-areas
// Every shape is an official sub-district (khwaeng, OpenStreetMap admin level
// 8) or a union of them, read from content/sources/bangkok-khwaeng.geojson
// (fetched by scripts/fetch-khwaeng.mjs; © OpenStreetMap contributors, ODbL).
// Nothing is drawn by hand. The table below is the one place that says which
// sub-districts make up each sub-area; docs/boundaries.md explains the choices.
// Usage: node scripts/area-boundaries.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { union } from 'polyclip-ts'

/** Sub-area -> sub-districts (English OSM names, without " Subdistrict"). */
const SUBAREAS = {
  'old-town': {
    'khao-san': ['Talat Yot'],
    'grand-palace': ['Phra Borom Maha Ratchawang', 'Wang Burapha Phirom', 'Wat Ratchabophit', 'Samran Rat', 'San Chao Pho Suea', 'Sao Chingcha'],
    banglamphu: ['Chana Songkhram', 'Bowon Niwet', 'Ban Phan Thom', 'Bang Khun Phrom', 'Wat Sam Phraya'],
  },
  chinatown: {
    yaowarat: ['Samphanthawong'],
    'talat-noi': ['Talat Noi'],
    'song-wat': ['Chakkrawat'],
  },
  silom: {
    'silom-road': ['Si Lom', 'Suriyawong'],
    sathorn: ['Thung Maha Mek', 'Thung Wat Don'],
    surasak: ['Yan Nawa'],
  },
  riverside: {
    'charoen-krung': ['Bang Rak', 'Wat Phraya Krai'],
    'bang-rak': ['Si Phraya'],
    'khlong-san': ['Khlong Ton Sai', 'Khlong San', 'Somdet Chao Phraya', 'Bang Lamphu Lang'],
  },
  siam: {
    'siam-square': ['Wang Mai', 'Pathum Wan'],
    ratchaprasong: ['Lumphini'],
    pratunam: ['Thanon Phaya Thai', 'Thanon Phetchaburi'],
  },
  sukhumvit: {
    nana: ['Khlong Toei Nuea'],
    asok: ['Khlong Toei'],
    'phrom-phong': ['Khlong Tan Nuea', 'Khlong Tan'],
  },
  'thonglor-ekkamai': {
    thonglor: ['Khlong Tan Nuea'],
    ekkamai: ['Phra Khanong Nuea'],
    'phra-khanong': ['Phra Khanong', 'Phra Khanong Tai'],
  },
  ari: {
    'ari-sois': ['Phaya Thai'],
    'saphan-khwai': ['Sam Sen Nai', 'Chatuchak'],
  },
}

const SOURCE = 'OpenStreetMap sub-districts (khwaeng, admin level 8) via Overpass, © OpenStreetMap contributors, ODbL 1.0'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content')
const src = JSON.parse(readFileSync(join(root, 'sources', 'bangkok-khwaeng.geojson'), 'utf8'))
// Bangkok's own sub-districts are "แขวง …"; the box also caught "ตำบล …" of the next provinces.
const byName = new Map()
for (const f of src.features) {
  if (!f.properties.name.startsWith('แขวง')) continue
  const name = f.properties.nameEn.replace(/ Subdistrict$/, '')
  if (byName.has(name)) byName.set(name, null) // ambiguous: Bang Chak and Bang Mot exist twice inside Bangkok
  else byName.set(name, f)
}
function shape(name) {
  const f = byName.get(name)
  if (f === undefined) throw new Error(`sub-district "${name}" not in the source`)
  if (f === null) throw new Error(`sub-district "${name}" is ambiguous; key it another way`)
  return f
}

const round = (n) => Math.round(n * 1e5) / 1e5
const clean = (multi) => multi.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => [round(lon), round(lat)])))
const count = (multi) => multi.reduce((n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0), 0)

function write(relPath, props, coordinates) {
  const file = join(root, 'boundaries', relPath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ type: 'Feature', properties: { ...props, source: SOURCE }, geometry: { type: 'MultiPolygon', coordinates } }) + '\n')
}

for (const [areaId, subs] of Object.entries(SUBAREAS)) {
  const areaParts = []
  for (const [subId, names] of Object.entries(subs)) {
    const parts = names.map((n) => shape(n))
    const merged = clean(union(...parts.map((f) => f.geometry.coordinates)))
    write(`${areaId}/${subId}.geojson`, { area: areaId, subarea: subId, districts: names, osmIds: parts.map((f) => f.properties.osmId) }, merged)
    areaParts.push(...parts.map((f) => f.geometry.coordinates))
    console.log(`${areaId}/${subId}: ${names.join(' + ')} -> ${count(merged)} points`)
  }
  const merged = clean(union(...areaParts))
  write(`${areaId}.geojson`, { area: areaId, districts: Object.values(subs).flat() }, merged)
  console.log(`${areaId}: ${merged.length} polygon(s), ${count(merged)} points`)
}
