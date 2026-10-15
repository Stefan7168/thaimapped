import type { Map as MaplibreMap } from 'maplibre-gl'

export const BUILDING_3D_LAYER_ID = 'tm-building-3d'

/**
 * 3D buildings from the OpenMapTiles `building` source-layer. Heights come
 * from the tiles' render_height (OSM data), never invented. For Thailand
 * fewer than 3% of OSM buildings carry a height tag, so most extrude to the
 * tiles' default; the Overture route is the week-one test for real heights.
 * minzoom 14 plus the 14 to 15.5 fade means nothing renders on overviews.
 */
export function addBuilding3DLayer(map: MaplibreMap): void {
  if (map.getLayer(BUILDING_3D_LAYER_ID) || !map.getSource('openmaptiles')) return
  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
  map.addLayer(
    {
      id: BUILDING_3D_LAYER_ID,
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-color': '#e9e2d3',
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 0.9],
      },
    },
    firstSymbolId,
  )
}
