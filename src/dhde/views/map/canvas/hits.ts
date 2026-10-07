/**
 * What each animated canvas drew last frame, in container pixels, so a hover can say which
 * bus, coach or train is under the cursor (canvases themselves take no pointer events).
 */
export interface Hit {
  x: number
  y: number
  r: number
  kind: 'bus' | 'coach' | 'train'
  title: string
  lines: string[]
}

const layers = new Map<string, Hit[]>()

export function setHits(layer: string, hits: Hit[]) {
  layers.set(layer, hits)
}

export function clearHits(layer: string) {
  layers.delete(layer)
}

/** The nearest drawn vehicle within its radius of (x, y), or null. */
export function hitAt(x: number, y: number): Hit | null {
  let best: Hit | null = null
  let bestD = Infinity
  for (const hits of layers.values()) {
    for (const h of hits) {
      const d = Math.hypot(h.x - x, h.y - y)
      if (d <= h.r + 3 && d < bestD) {
        best = h
        bestD = d
      }
    }
  }
  return best
}
