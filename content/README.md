# Content

Everything the site shows lives here as JSON. `pnpm validate:content` checks shape and cross references.

Status of the Bangkok set (2026-10-15):

- Areas and sub-areas: real names, approximate centres.
- Stations: extracted from OpenStreetMap (ODbL), coordinates are real.
- Landmark pins: real places with coordinates written from general knowledge, accurate to roughly 100 m. Verify each against OpenStreetMap before launch.
- Hotel pins: placeholders. Replace with real picks and plain Agoda/Booking URLs during the content pass.
- Walk minutes: estimates, not measured routes.
- Place shapes (`shapes/<area>/<pin>.geojson`): a street's real road stretch (MultiLineString) or a zone's real area such as a market (MultiPolygon), from OpenStreetMap (ODbL) via `scripts/fetch-place-shapes.mjs`, referenced from the pin's `shape`. Never drawn by hand. The explorer draws a street as a glowing line and a zone as a soft wash with its 3D buildings tinted.
- Area and sub-area outlines (`boundaries/<area>.geojson`, `boundaries/<area>/<sub>.geojson`): official Bangkok sub-districts (khwaeng) from OpenStreetMap (ODbL), merged by `scripts/area-boundaries.mjs` from `sources/bangkok-khwaeng.geojson` (fetched by `scripts/fetch-khwaeng.mjs`). Never drawn by hand. The mapping and every known mismatch are in [docs/boundaries.md](../docs/boundaries.md).
