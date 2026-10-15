#!/usr/bin/env node
// Validates every file under content/ against its JSON Schema and checks
// cross references (city -> areas, area -> stations, pin walk -> station).
// Runs before build and in CI. Content is the product, so a broken file
// must fail loudly, never render as a blank spot.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content')
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
for (const name of ['common', 'country', 'city', 'area', 'route']) ajv.addSchema(read(`schema/${name}.schema.json`))

const errors = []
function check(schemaId, data, label) {
  const validate = ajv.getSchema(`https://thaimapped.com/schema/${schemaId}.schema.json`)
  if (!validate(data)) {
    for (const e of validate.errors) errors.push(`${label}: ${e.instancePath || '/'} ${e.message}`)
  }
}

const country = read('country.json')
check('country', country, 'country.json')

for (const { id: cityId } of country.cities) {
  let city
  try {
    city = read(`cities/${cityId}.json`)
  } catch {
    if (country.cities.find((c) => c.id === cityId).status === 'live') errors.push(`country.json: live city ${cityId} has no cities/${cityId}.json`)
    continue
  }
  check('city', city, `cities/${cityId}.json`)
  if (city.id !== cityId) errors.push(`cities/${cityId}.json: id is ${city.id}`)

  const stationIds = new Set()
  if (city.stations) {
    const s = read(city.stations)
    for (const st of s.stations) {
      if (stationIds.has(st.id)) errors.push(`${city.stations}: duplicate station ${st.id}`)
      stationIds.add(st.id)
      if (typeof st.code !== 'string') errors.push(`${city.stations}: station ${st.id} code must be a string (use '' when none)`)
      if (!st.name?.en) errors.push(`${city.stations}: station ${st.id} has no English name`)
      if (typeof st.lat !== 'number' || typeof st.lon !== 'number') errors.push(`${city.stations}: station ${st.id} has no coordinates`)
    }
  }
  if (city.lines) {
    const lineKeys = new Set(read(city.lines).lines.map((l) => `${l.system}/${l.line}`))
    if (city.stations) {
      for (const st of read(city.stations).stations) {
        if (!lineKeys.has(`${st.system}/${st.line}`)) errors.push(`${city.stations}: station ${st.id} on unknown line ${st.system}/${st.line}`)
      }
    }
  }

  const seenColors = new Map()
  for (const areaId of city.areas) {
    let area
    try {
      area = read(`areas/${areaId}.json`)
    } catch {
      errors.push(`cities/${cityId}.json: area ${areaId} has no areas/${areaId}.json`)
      continue
    }
    const label = `areas/${areaId}.json`
    check('area', area, label)
    if (area.id !== areaId) errors.push(`${label}: id is ${area.id}`)
    if (area.city !== cityId) errors.push(`${label}: city is ${area.city}, expected ${cityId}`)
    if (seenColors.has(area.color)) errors.push(`${label}: color ${area.color} already used by ${seenColors.get(area.color)}`)
    seenColors.set(area.color, areaId)
    for (const st of area.stations ?? []) if (!stationIds.has(st)) errors.push(`${label}: unknown station ${st}`)
    const checkOutline = (path, subId) => {
      let outline
      try {
        outline = read(path)
      } catch {
        errors.push(`${label}: polygon file ${path} is missing`)
        return
      }
      if (outline.type !== 'Feature' || outline.geometry?.type !== 'MultiPolygon') errors.push(`${path}: must be a Feature with a MultiPolygon`)
      if (outline.properties?.area !== areaId) errors.push(`${path}: belongs to area ${outline.properties?.area}, not ${areaId}`)
      if (subId && outline.properties?.subarea !== subId) errors.push(`${path}: belongs to sub-area ${outline.properties?.subarea}, not ${subId}`)
      if (!outline.properties?.source) errors.push(`${path}: has no source note`)
    }
    if (area.polygon) checkOutline(area.polygon, null)
    for (const sub of area.subareas ?? []) if (sub.polygon) checkOutline(sub.polygon, sub.id)
    const subIds = new Set()
    for (const sub of area.subareas ?? []) {
      if (subIds.has(sub.id)) errors.push(`${label}: duplicate sub-area ${sub.id}`)
      subIds.add(sub.id)
    }
    const pinIds = new Set()
    for (const pin of area.pins ?? []) {
      if (pinIds.has(pin.id)) errors.push(`${label}: duplicate pin ${pin.id}`)
      pinIds.add(pin.id)
      if (pin.kind === 'hotel' && !pin.tier) errors.push(`${label}: hotel pin ${pin.id} needs a tier`)
      if (pin.subarea && !subIds.has(pin.subarea)) errors.push(`${label}: pin ${pin.id} names unknown sub-area ${pin.subarea}`)
      if (pin.walk && !stationIds.has(pin.walk.station)) errors.push(`${label}: pin ${pin.id} walks to unknown station ${pin.walk.station}`)
      if (pin.shape) {
        let shape
        try {
          shape = read(pin.shape.path)
        } catch {
          errors.push(`${label}: shape file ${pin.shape.path} for pin ${pin.id} is missing`)
          continue
        }
        const want = pin.shape.kind === 'street' ? 'MultiLineString' : 'MultiPolygon'
        if (shape.type !== 'Feature' || shape.geometry?.type !== want) errors.push(`${pin.shape.path}: must be a Feature with a ${want}`)
        if (shape.properties?.area !== areaId || shape.properties?.pin !== pin.id) errors.push(`${pin.shape.path}: belongs to ${shape.properties?.area}/${shape.properties?.pin}, not ${areaId}/${pin.id}`)
        if (!shape.properties?.source) errors.push(`${pin.shape.path}: has no source note`)
      }
    }
  }
}

// Routes: each must belong to a live city and have unique stop ids.
const liveCities = new Set(country.cities.filter((c) => c.status === 'live').map((c) => c.id))
for (const f of readdirSync(join(root, 'routes'))) {
  const route = read(`routes/${f}`)
  const label = `routes/${f}`
  check('route', route, label)
  if (route.id !== f.replace(/\.json$/, '')) errors.push(`${label}: id is ${route.id}`)
  if (!liveCities.has(route.city)) errors.push(`${label}: city ${route.city} is not live`)
  if (route.duration === 'multi-day' && route.days < 2) errors.push(`${label}: multi-day trip needs days >= 2`)
  if (route.duration !== 'multi-day' && route.days !== 1) errors.push(`${label}: a ${route.duration} trip must have days = 1`)
  const ids = new Set()
  for (const stop of route.stops ?? []) {
    if (ids.has(stop.id)) errors.push(`${label}: duplicate stop ${stop.id}`)
    ids.add(stop.id)
    if (stop.day > route.days) errors.push(`${label}: stop ${stop.id} is on day ${stop.day} of ${route.days}`)
  }
}

// Orphan areas: a file nobody lists is a mistake, not spare content.
const listed = new Set(country.cities.flatMap((c) => { try { return read(`cities/${c.id}.json`).areas } catch { return [] } }))
for (const f of readdirSync(join(root, 'areas'))) {
  const id = f.replace(/\.json$/, '')
  if (!listed.has(id)) errors.push(`areas/${f}: not listed by any city`)
}

if (errors.length) {
  console.error(`[validate-content] ${errors.length} problem(s):`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('[validate-content] ok')
