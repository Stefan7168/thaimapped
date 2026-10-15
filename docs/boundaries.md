# Area and sub-area outlines

What the explorer draws when an area or a sub-area is ticked, where the shapes come from, and why each sub-area maps to the sub-districts it does. Decided in the "Bangkok Map" project thread on 2026-10-15; owner's call: "You are the expert, make sure you document everything."

## Rule

- A **sub-area** outline is one or more official Bangkok sub-districts (khwaeng, OpenStreetMap `admin_level=8`), merged.
- An **area** outline is the union of its sub-areas' sub-districts.
- Nothing is drawn by hand. If no official line fits, the nearest sub-district is used and the mismatch is written here, never hidden.
- Ticking a whole area draws the area; ticking a sub-area draws only that sub-area (unless its whole area is ticked too). Colour is the area's `--area-N` token, fill at 8 %, 2.5 px line.

## Sources

| Level | Source | Licence | Fetched by | File |
|---|---|---|---|---|
| Sub-districts (khwaeng) | OpenStreetMap via the Overpass API, bbox 13.62,100.44 to 13.84,100.66, 169 relations of which 134 are Bangkok's (Thai name starts with แขวง; the rest are ตำบล of Nonthaburi and Samut Prakan) | ODbL 1.0, © OpenStreetMap contributors | `scripts/fetch-khwaeng.mjs`, run on the owner's Mac on 2026-10-15 (the cloud box cannot reach OpenStreetMap) | `content/sources/bangkok-khwaeng.geojson` (534 KB, committed) |
| Districts (khet), used 2026-10-15 before the sub-district version | geoBoundaries gbOpen THA ADM2 (Royal Thai Survey Department via OCHA, 2019) | CC BY 3.0 IGO | one-off download, not committed | superseded; the footer credit stays until the next footer edit |

Build: `node scripts/area-boundaries.mjs` writes `content/boundaries/<area>/<sub>.geojson` and `content/boundaries/<area>.geojson`, coordinates rounded to 5 decimals (about 1 m), unions via `polyclip-ts`. `pnpm validate:content` checks every referenced file exists, is a MultiPolygon Feature, belongs to the right area and sub-area, and carries a source note.

Overpass notes learned the hard way: it answers **406** to Node's default `node` user agent (send a descriptive one), and 429/502/503/504 under load (the script retries three times, 30 s apart). English names in OSM end in " Subdistrict"; two names repeat inside Bangkok (Bang Chak, Bang Mot), so the build keys by name only where the name is unique and refuses the ambiguous ones.

## Mapping, with the reasons

Measured on 2026-10-15 by testing every sub-area centre and every pin against all 134 sub-district polygons (point in polygon). "Centre" is the approximate sub-area centre in `content/areas/<id>.json`.

| Area | Sub-area | Sub-districts | Why |
|---|---|---|---|
| Old Town | Khao San | Talat Yot | Khao San Road and the sub-area centre are in Talat Yot. |
| Old Town | Grand Palace and Wat Pho | Phra Borom Maha Ratchawang, Wang Burapha Phirom, Wat Ratchabophit, Samran Rat, San Chao Pho Suea, Sao Chingcha | The palace and Wat Pho are in Phra Borom Maha Ratchawang; the five others are the temple quarter south and east of it (Wat Suthat, the Giant Swing), so the area covers all of Phra Nakhon. Wat Arun pin is across the river in Wat Arun sub-district and stays outside on purpose. |
| Old Town | Banglamphu | Chana Songkhram, Bowon Niwet, Ban Phan Thom, Bang Khun Phrom, Wat Sam Phraya | The centre falls in Chana Songkhram; the other four are the northern half of Phra Nakhon. |
| Chinatown | Yaowarat | Samphanthawong | Yaowarat Road's core. Wat Traimit measured in Talat Noi, so its pin was moved to that sub-area. |
| Chinatown | Talat Noi | Talat Noi | Exact match. |
| Chinatown | Song Wat | Chakkrawat | Song Wat Road and the centre are in Chakkrawat. |
| Silom and Sathorn | Silom Road | Si Lom, Suriyawong | The road runs through both. |
| Silom and Sathorn | Sathorn | Thung Maha Mek, Thung Wat Don | South of Sathorn Road. Sathorn Road itself is the Si Lom border, so the sub-area centre (on the road) and the Mahanakhon tower measure in Si Lom, north of the line. |
| Silom and Sathorn | Surasak | Yan Nawa | South of Sathorn at Surasak BTS; the centre, on the road, measures in Si Lom. Lumphini Park pin is in Lumphini sub-district (Siam area) and stays outside. |
| Riverside | Charoen Krung | Bang Rak, Wat Phraya Krai | The centre and the placeholder hotel are in Bang Rak sub-district; Wat Phraya Krai (Bang Kho Laem district) holds Asiatique and the southern stretch of Charoen Krung. These two do not touch, so the sub-area is two polygons. |
| Riverside | Bang Rak | Si Phraya | The sub-area centre measures in Si Phraya, not in the Bang Rak sub-district of the same name, because the content's "Bang Rak" means the River City and Si Phraya pier stretch. Rename candidate. |
| Riverside | Khlong San | Khlong Ton Sai, Khlong San, Somdet Chao Phraya, Bang Lamphu Lang | The whole Khlong San district; ICONSIAM is in Khlong Ton Sai. |
| Siam and Pratunam | Siam Square | Wang Mai, Pathum Wan | Siam Square and Paragon are in Pathum Wan; MBK, BACC and Jim Thompson House in Wang Mai. |
| Siam and Pratunam | Ratchaprasong | Lumphini | Erawan Shrine is in Lumphini. CentralWorld measures in Pathum Wan, at the border, and stays outside rather than doubling Pathum Wan into two sub-areas. |
| Siam and Pratunam | Pratunam | Thanon Phaya Thai, Thanon Phetchaburi | The centre and Baiyoke Tower are in Thanon Phaya Thai; Pratunam market is at the Thanon Phetchaburi edge. |
| Sukhumvit | Nana | Khlong Toei Nuea | North side of Sukhumvit Road. Sukhumvit Road is the border with Khlong Toei, so the placeholder hotel on the south side measures outside. |
| Sukhumvit | Asok | Khlong Toei | South side (Benjakitti, Queen Sirikit centre). Terminal 21 is on the north side in Khlong Toei Nuea and measures outside. Nana and Asok are both on this border; no official line separates them. |
| Sukhumvit | Phrom Phong | Khlong Tan Nuea, Khlong Tan | Both sides of the road around Soi 24 to 39. |
| Thonglor and Ekkamai | Thonglor | Khlong Tan Nuea | Soi 55. Shares this sub-district with Phrom Phong: no official line separates Phrom Phong from Thonglor. |
| Thonglor and Ekkamai | Ekkamai | Phra Khanong Nuea | Soi 63 and east. |
| Thonglor and Ekkamai | Phra Khanong | Phra Khanong, Phra Khanong Tai | South of the road at Phra Khanong BTS. |
| Ari | Ari sois | Phaya Thai | The centre and the placeholder hotel measure in Phaya Thai sub-district, not Sam Sen Nai. |
| Ari | Saphan Khwai | Sam Sen Nai, Chatuchak | Saphan Khwai BTS is in Sam Sen Nai; Chatuchak Weekend Market (listed under this sub-area) is in Chatuchak. |

Known overlaps, by design: Khlong Tan Nuea belongs to both Phrom Phong (Sukhumvit) and Thonglor; the two areas overlap there and nowhere else now.

## Pins that sit outside their sub-area's outline (measured)

Wat Arun (across the river), Lumphini Park (Siam side of the line), King Power Mahanakhon and the Silom placeholder hotel (north of Sathorn Road), CentralWorld (Pathum Wan, at the Ratchaprasong border), Baiyoke (inside now), Terminal 21 and the Nana placeholder hotel (opposite sides of Sukhumvit Road), Chatuchak Market (inside now), Asiatique (inside now). These are content facts, not errors in the shapes.

## To rebuild

1. On a machine with network: `node scripts/fetch-khwaeng.mjs` (writes the source file; commit it).
2. `node scripts/area-boundaries.mjs` (writes the outlines; commit them).
3. `pnpm validate:content`.
