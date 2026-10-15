#!/usr/bin/env node
// Turns each route's hand-placed waypoints into a road-following line using
// the public OSRM demo server (OpenStreetMap data, no key) and writes it
// into the route file's "path". Run it after editing waypoints:
//   node scripts/route-paths.mjs            # every route with path: null
//   node scripts/route-paths.mjs --force    # every route
// The demo server is for light use; a self-hosted OSRM or Valhalla goes
// here when routes grow past a handful.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'routes')
const force = process.argv.includes('--force')
const PROFILE = { car: 'driving', scooter: 'driving', transit: 'driving', walk: 'foot', boat: 'driving' }

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const p = join(dir, file)
  const route = JSON.parse(readFileSync(p, 'utf8'))
  if (route.path && !force) continue
  const coords = route.waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/${PROFILE[route.mode] ?? 'driving'}/${coords}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${file}: OSRM ${res.status}`)
  const json = await res.json()
  const r = json.routes?.[0]
  if (!r) throw new Error(`${file}: no route returned`)
  route.path = r.geometry.coordinates.map(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))])
  route.distanceKm = Math.round(r.distance / 1000)
  writeFileSync(p, JSON.stringify(route, null, 2) + '\n')
  console.log(`[route-paths] ${file}: ${route.path.length} points, ${route.distanceKm} km`)
}
