/**
 * A directions link a phone understands: Google Maps' universal URL opens
 * the Maps app where it is installed and the web map elsewhere. The point
 * is the place's own position, so the route ends at the door, not at a
 * name search. No partner, no tracking.
 */
export function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}&travelmode=walking`
}
