/**
 * Building shadows on the ground for a sun position, in lat/lon, plus point-in-shade tests
 * and the share of a site's visit area in shade. Each shadow is the convex hull of the
 * footprint and the footprint moved along the shadow vector (good for box-like buildings).
 */
import { shadowVector } from './sun'
import type { Sun } from './sun'

export type Ring = [number, number][]
export interface Building {
  h: number
  est: boolean
  ring: Ring
}
export interface Shadow {
  ring: Ring
  box: [number, number, number, number] // minLat, minLon, maxLat, maxLon
}

function hull(pts: Ring): Ring {
  const p = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  if (p.length < 3) return p
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1])
  const lo: Ring = []
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop()
    lo.push(q)
  }
  const up: Ring = []
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop()
    up.push(q)
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)]
}

export function shadowsFor(buildings: Building[], sun: Sun): Shadow[] {
  const out: Shadow[] = []
  for (const b of buildings) {
    const v = shadowVector(sun, b.h)
    if (!v || b.ring.length < 3) continue
    const lat0 = b.ring[0][0]
    const dLat = v[1] / 110540
    const dLon = v[0] / (111320 * Math.cos((lat0 * Math.PI) / 180))
    const ring = hull([...b.ring, ...b.ring.map(([la, lo]) => [la + dLat, lo + dLon] as [number, number])])
    let a = Infinity
    let c = Infinity
    let bb = -Infinity
    let d = -Infinity
    for (const [la, lo] of ring) {
      a = Math.min(a, la)
      c = Math.min(c, lo)
      bb = Math.max(bb, la)
      d = Math.max(d, lo)
    }
    out.push({ ring, box: [a, c, bb, d] })
  }
  return out
}

export function inRing(lat: number, lon: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside
  }
  return inside
}

export function inShade(lat: number, lon: number, shadows: Shadow[]): boolean {
  for (const s of shadows) {
    if (lat < s.box[0] || lat > s.box[2] || lon < s.box[1] || lon > s.box[3]) continue
    if (inRing(lat, lon, s.ring)) return true
  }
  return false
}

/** Random point inside a ring (rejection sampling in its bounding box). */
export function pointIn(ring: Ring): [number, number] {
  let a = Infinity
  let c = Infinity
  let b = -Infinity
  let d = -Infinity
  for (const [la, lo] of ring) {
    a = Math.min(a, la)
    c = Math.min(c, lo)
    b = Math.max(b, la)
    d = Math.max(d, lo)
  }
  for (let k = 0; k < 40; k++) {
    const p: [number, number] = [a + Math.random() * (b - a), c + Math.random() * (d - c)]
    if (inRing(p[0], p[1], ring)) return p
  }
  return [(a + b) / 2, (c + d) / 2]
}

/** Share of a visit area in shade (0..1), from a fixed grid of sample points. */
export function shadeShare(area: Ring, shadows: Shadow[]): number {
  let a = Infinity
  let c = Infinity
  let b = -Infinity
  let d = -Infinity
  for (const [la, lo] of area) {
    a = Math.min(a, la)
    c = Math.min(c, lo)
    b = Math.max(b, la)
    d = Math.max(d, lo)
  }
  let n = 0
  let s = 0
  const N = 18
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const la = a + ((i + 0.5) / N) * (b - a)
      const lo = c + ((j + 0.5) / N) * (d - c)
      if (!inRing(la, lo, area)) continue
      n++
      if (inShade(la, lo, shadows)) s++
    }
  return n ? s / n : 0
}
