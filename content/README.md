# Content

Everything the site shows lives here as JSON. `pnpm validate:content` checks shape and cross references.

Status of the Bangkok set (2026-10-15):

- Areas and sub-areas: real names, approximate centres.
- Stations: extracted from OpenStreetMap (ODbL), coordinates are real.
- Landmark pins: real places with coordinates written from general knowledge, accurate to roughly 100 m. Verify each against OpenStreetMap before launch.
- Hotel pins: placeholders. Replace with real picks and plain Agoda/Booking URLs during the content pass.
- Walk minutes: estimates, not measured routes.
- A pin's `when` (times of day it is open or at its best, days if not every day, an optional note) drives the "When" filter and the line on the card. Editorial: written from general knowledge of opening hours in the 2026-10 content pass, not checked against each venue; a wrong one is a content bug to fix in the area file.
- Place shapes (`shapes/<area>/<pin>.geojson`): a street's real road stretch (MultiLineString) or a zone's real area such as a market (MultiPolygon), from OpenStreetMap (ODbL) via `scripts/fetch-place-shapes.mjs`, referenced from the pin's `shape`. Never drawn by hand. The explorer draws a street as a glowing line and a zone as a soft wash with its 3D buildings tinted.
- Area and sub-area outlines (`boundaries/<area>.geojson`, `boundaries/<area>/<sub>.geojson`): official Bangkok sub-districts (khwaeng) from OpenStreetMap (ODbL), merged by `scripts/area-boundaries.mjs` from `sources/bangkok-khwaeng.geojson` (fetched by `scripts/fetch-khwaeng.mjs`). Never drawn by hand. The mapping and every known mismatch are in [docs/boundaries.md](../docs/boundaries.md).
