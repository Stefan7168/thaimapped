# Content

Everything the site shows lives here as JSON. `pnpm validate:content` checks shape and cross references.

Status of the Bangkok set (2026-10-15):

- Areas and sub-areas: real names, approximate centres.
- Stations: extracted from OpenStreetMap (ODbL), coordinates are real.
- Landmark pins: real places with coordinates written from general knowledge, accurate to roughly 100 m. Verify each against OpenStreetMap before launch.
- Hotel pins: 24 real hotels, three per area (luxury, mid, budget), a starting set to work with, not editorial picks. Each one is a hotel or hostel object in OpenStreetMap (coordinates from Nominatim, 2026-10-15). The OSM ids are in the commit that added them. The `why` line only states the location. Links: a Booking.com search for the hotel name (in a browser the hotel is the first result; plain curl gets a 202 bot check). No Agoda links: `agoda.com/search?city=9395&textToSearch=…` opens a general Bangkok search that ignores the name, and without `city` it redirects to the home page. Swap in exact hotel page URLs during the content pass.
- Hotel walk minutes: straight line at 75 m per minute to the nearest station *listed on the area*, rounded up. Where the nearest real station is not on the area's list (Phrom Phong, Saphan Khwai, Surasak, Khao San's walk to the river piers), the number is longer than the real walk.
- Walk minutes: estimates, not measured routes.
- A pin's `when` (times of day it is open or at its best, days if not every day, an optional note) drives the "When" filter and the line on the card. Editorial: written from general knowledge of opening hours in the 2026-10 content pass, not checked against each venue; a wrong one is a content bug to fix in the area file.
- Place shapes (`shapes/<area>/<pin>.geojson`): a street's real road stretch (MultiLineString) or a zone's real area such as a market (MultiPolygon), from OpenStreetMap (ODbL) via `scripts/fetch-place-shapes.mjs`, referenced from the pin's `shape`. Never drawn by hand. The explorer draws a street as a glowing line and a zone as a soft wash with its 3D buildings tinted.
- Area and sub-area outlines (`boundaries/<area>.geojson`, `boundaries/<area>/<sub>.geojson`): official Bangkok sub-districts (khwaeng) from OpenStreetMap (ODbL), merged by `scripts/area-boundaries.mjs` from `sources/bangkok-khwaeng.geojson` (fetched by `scripts/fetch-khwaeng.mjs`). Never drawn by hand. The mapping and every known mismatch are in [docs/boundaries.md](../docs/boundaries.md).
