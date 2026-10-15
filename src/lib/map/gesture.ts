/**
 * "Is the user physically gesturing on this map right now?"
 * Narrower than map.isMoving() (also true during momentum and programmatic
 * flights). System-initiated camera moves must never interrupt a live
 * finger-down gesture: doing so hard-resets the handler and the drag dies.
 * isActive() is public API on every handler below in maplibre-gl 6.
 */
export interface GestureHandlerLike {
  isActive(): boolean
}

export interface GestureMapLike {
  dragPan?: GestureHandlerLike
  touchZoomRotate?: GestureHandlerLike
  touchPitch?: GestureHandlerLike
  dragRotate?: GestureHandlerLike
  boxZoom?: GestureHandlerLike
  scrollZoom?: GestureHandlerLike
}

export function isGestureActive(map: GestureMapLike): boolean {
  return Boolean(
    map.dragPan?.isActive() ||
      map.touchZoomRotate?.isActive() ||
      map.touchPitch?.isActive() ||
      map.dragRotate?.isActive() ||
      map.boxZoom?.isActive() ||
      map.scrollZoom?.isActive(),
  )
}
