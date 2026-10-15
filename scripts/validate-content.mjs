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
for (const name of ['common', 'country', 'city', 'area']) ajv.addSchema(read(`schema/${name}.schema.json`))

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
    }
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
