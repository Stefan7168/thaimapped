# Content

Everything the site shows lives here as JSON. `pnpm validate:content` checks shape and cross references.

Status of the Bangkok set (2026-10-15):

- Areas and sub-areas: real names, approximate centres.
- Stations: extracted from OpenStreetMap (ODbL), coordinates are real.
- Landmark pins: real places with coordinates written from general knowledge, accurate to roughly 100 m. Verify each against OpenStreetMap before launch.
- Hotel pins: placeholders. Replace with real picks and plain Agoda/Booking URLs during the content pass.
- Walk minutes: estimates, not measured routes.
- Area outlines (`boundaries/*.geojson`): the border of the Bangkok district(s) each area sits in, built by `node scripts/area-boundaries.mjs <geoBoundaries-THA-ADM2.geojson>` from geoBoundaries gbOpen THA ADM2 (Royal Thai Survey Department data via OCHA, CC BY 3.0 IGO, credited in the footer). Never drawn by hand. The area-to-district table lives in the script; two areas can share a district (Silom and Riverside share Bang Rak, Sukhumvit and Thonglor-Ekkamai share Vadhana), and the Phra Khanong sub-area centre sits just outside the Thonglor-Ekkamai outline, on the Khlong Toei side of Sukhumvit Road.
