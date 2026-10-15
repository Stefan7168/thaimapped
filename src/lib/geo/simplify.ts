/**
 * Ramer–Douglas–Peucker line simplification in degrees. A road line of
 * 4,000 points drawn 300 px wide needs a few hundred; the rest is weight
 * on the page. 0.001° is about 110 m at Bangkok's latitude.
 */
export function simplifyLine(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 2) return points
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let worst = -1
    let worstAt = -1
    for (let i = a + 1; i < b; i++) {
      const d = pointToSegment(points[i], points[a], points[b])
      if (d > worst) { worst = d; worstAt = i }
    }
    if (worst > tolerance && worstAt > 0) {
      keep[worstAt] = true
      stack.push([a, worstAt], [worstAt, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

function pointToSegment([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const x = ax + u * dx
  const y = ay + u * dy
  return Math.hypot(px - x, py - y)
}
