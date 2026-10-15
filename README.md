# ThaiMapped

Interactive 3D paper-style map of Thailand for first-time visitors: see where everything is, pick an area, pick a hotel near a station. Bangkok first, then Chiang Mai, Phuket, Krabi.

Plan and architecture (source of truth for decisions):

- Project plan: https://claude.ai/code/artifact/77043149-0898-4fea-9d06-29c4a663fde6
- Technical architecture: https://claude.ai/code/artifact/eea407f6-b795-46b1-960a-76e742eae125

## Three rules

1. Content JSON in `content/` is the product. `scripts/validate-content.mjs` runs before every build.
2. Nothing needs a key to run. Map tiles come from OpenFreeMap, no account.
3. 2D must work on old Android. 3D is opt-in by device capability (`src/lib/map/device.ts`).

## Run

```sh
pnpm install
pnpm dev        # http://localhost:3000 redirects to /en
pnpm check      # validate content, typecheck, lint
pnpm build
```

Node 22 or newer, pnpm 10.

## Layout

- `content/` country, cities, areas, stations, lines, JSON Schemas
- `public/map/paper.json` the map style (OpenMapTiles schema via OpenFreeMap)
- `src/lib/map/` MapLibre loader, 3D buildings, gesture guard, device check
- `src/lib/content/` typed loaders (server only)
- `src/lib/links/` affiliate link builder with sub-IDs
- `src/lib/i18n/` locales and UI strings (English only at launch, shape ready for more)
- `src/components/map/explorer-map.tsx` the map; `src/components/explorer/` the panel and pages' UI

Map data (c) OpenStreetMap contributors, ODbL. Station list extracted from OSM (see `content/cities/bangkok.stations.json`).
