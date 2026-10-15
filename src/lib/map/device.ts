/**
 * Decide 3D or 2D before the map is created. 2D must work on old Android,
 * so the pitched, extruded view is opt-in by capability, never assumed.
 */
let cached: boolean | null = null

export function supports3D(): boolean {
  if (typeof window === 'undefined') return false
  if (cached !== null) return cached
  cached = detect()
  return cached
}

function detect(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
  } catch {
    return false
  }
  const cores = navigator.hardwareConcurrency ?? 2
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return cores >= 4 && !reducedMotion
}
