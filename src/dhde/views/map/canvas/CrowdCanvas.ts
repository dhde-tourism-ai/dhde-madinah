import type L from 'leaflet'
import { CanvasOverlay } from './CanvasOverlay'

/**
 * People on foot at each site, the way a telecom feed would show them: visitors arrive
 * through one of the site's entrances (on the street network), walk in, wander and linger
 * for about the site's typical visit time, then leave through a different entrance.
 *
 * One dot is a group of people, not a person; the number of dots follows people on site
 * for the hour (square-root scaled). Time runs at TIMELAPSE x real walking pace, so a
 * 40-minute visit plays in about 3 minutes and dots move at a stroll, not a sprint.
 */
export const TIMELAPSE = 12
const WALK_MS = 1.3 * TIMELAPSE // m/s on screen-time
const ARRIVE = '#3987e5'
const STAY = '#7fe0c8'
const LEAVE = '#d55181'

export interface CrowdSite {
  id: string
  lat: number
  lon: number
  /** Radius of the visit area, metres. */
  zoneM: number
  /** Typical minutes on site (telecom dwell median). */
  dwellMin: number
  /** Entrances on the street network, [lat, lon]. */
  gates: [number, number][]
}

interface Agent {
  site: CrowdSite
  phase: 'in' | 'stay' | 'out'
  at: [number, number]
  to: [number, number]
  gateOut: number
  /** Seconds left on site (stay), or of the current pause while wandering. */
  left: number
  pause: number
  gone: boolean
}

const mPerLat = 111320
const mPerLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180)

function inZone(s: CrowdSite, frac = 1): [number, number] {
  const r = Math.sqrt(Math.random()) * s.zoneM * frac
  const a = Math.random() * Math.PI * 2
  return [s.lat + (Math.sin(a) * r) / mPerLat, s.lon + (Math.cos(a) * r) / mPerLon(s.lat)]
}

function distM(a: [number, number], b: [number, number]) {
  return Math.hypot((a[0] - b[0]) * mPerLat, (a[1] - b[1]) * mPerLon(a[0]))
}

function stepTo(a: Agent, speed: number, dt: number): boolean {
  const d = distM(a.at, a.to)
  const move = speed * dt
  if (d <= move) {
    a.at = a.to
    return true
  }
  const f = move / d
  a.at = [a.at[0] + (a.to[0] - a.at[0]) * f, a.at[1] + (a.to[1] - a.at[1]) * f]
  return false
}

/** Log-normal-ish spread around the median, seconds of screen time. */
function dwellSeconds(min: number) {
  const g = Math.exp((Math.random() + Math.random() + Math.random() - 1.5) * 0.55)
  return (min * 60 * g) / TIMELAPSE
}

export class CrowdCanvas extends CanvasOverlay {
  private sites: CrowdSite[] = []
  private target = new Map<string, number>()
  private agents: Agent[] = []
  private raf = 0
  private last = 0
  private spawnAcc = new Map<string, number>()
  private reduced = false

  constructor() {
    super('dhde-crowd', 455)
  }

  onAdd(map: L.Map): this {
    super.onAdd(map)
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    this.last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - this.last) / 1000)
      this.last = t
      if (!this.reduced && !this.zooming) this.step(dt)
      this.redraw()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
    return this
  }

  onRemove(map: L.Map): this {
    cancelAnimationFrame(this.raf)
    return super.onRemove(map)
  }

  /** Sites and how many dots each should hold this hour. */
  setData(sites: CrowdSite[], counts: Record<string, number>) {
    const first = this.sites.length === 0
    this.sites = sites
    for (const s of sites) this.target.set(s.id, counts[s.id] ?? 0)
    // First fill: start mid-visit so the map isn't empty while the first arrivals walk in.
    if (first) {
      for (const s of sites) {
        const n = counts[s.id] ?? 0
        for (let i = 0; i < n; i++) {
          const phase = Math.random()
          const a = this.spawn(s)
          if (phase < 0.7) {
            a.phase = 'stay'
            a.at = inZone(s)
            a.to = inZone(s)
            a.left = dwellSeconds(s.dwellMin) * Math.random()
          } else {
            a.at = [a.at[0] + (s.lat - a.at[0]) * Math.random(), a.at[1] + (s.lon - a.at[1]) * Math.random()]
          }
        }
      }
    }
  }

  private spawn(s: CrowdSite): Agent {
    const gIn = Math.floor(Math.random() * Math.max(1, s.gates.length))
    let gOut = Math.floor(Math.random() * Math.max(1, s.gates.length))
    // Most visitors leave by another way than they came (to a bus stop, car park or the next site).
    if (s.gates.length > 1 && gOut === gIn && Math.random() < 0.8) gOut = (gIn + 1 + Math.floor(Math.random() * (s.gates.length - 1))) % s.gates.length
    const gate = s.gates[gIn] ?? [s.lat + 0.003, s.lon]
    const jitter = (p: [number, number]): [number, number] => [p[0] + (Math.random() - 0.5) * 0.0004, p[1] + (Math.random() - 0.5) * 0.0004]
    const a: Agent = { site: s, phase: 'in', at: jitter(gate), to: inZone(s, 0.8), gateOut: gOut, left: dwellSeconds(s.dwellMin), pause: 0, gone: false }
    this.agents.push(a)
    return a
  }

  private step(dt: number) {
    const bySite = new Map<string, number>()
    for (const a of this.agents) if (!a.gone && a.phase !== 'out') bySite.set(a.site.id, (bySite.get(a.site.id) ?? 0) + 1)
    // Arrivals: top up towards this hour's level a few at a time; extras start leaving.
    for (const s of this.sites) {
      const want = this.target.get(s.id) ?? 0
      const have = bySite.get(s.id) ?? 0
      if (have < want) {
        const acc = (this.spawnAcc.get(s.id) ?? 0) + dt * Math.max(0.4, (want - have) / 8)
        let k = Math.floor(acc)
        this.spawnAcc.set(s.id, acc - k)
        while (k-- > 0) this.spawn(s)
      } else if (have > want + 1) {
        const a = this.agents.find((x) => x.site.id === s.id && x.phase === 'stay')
        if (a) a.left = 0
      }
    }
    for (const a of this.agents) {
      const s = a.site
      if (a.phase === 'in') {
        if (stepTo(a, WALK_MS, dt)) {
          a.phase = 'stay'
          a.to = inZone(s)
        }
      } else if (a.phase === 'stay') {
        a.left -= dt
        if (a.pause > 0) a.pause -= dt
        else if (stepTo(a, WALK_MS * 0.45, dt)) {
          a.to = inZone(s)
          a.pause = 1 + Math.random() * 5
        }
        if (a.left <= 0) {
          a.phase = 'out'
          const g = s.gates[a.gateOut] ?? [s.lat - 0.003, s.lon]
          a.to = [g[0] + (Math.random() - 0.5) * 0.0004, g[1] + (Math.random() - 0.5) * 0.0004]
        }
      } else if (stepTo(a, WALK_MS, dt)) a.gone = true
    }
    this.agents = this.agents.filter((a) => !a.gone)
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const z = this._map.getZoom()
    const r = z >= 15 ? 2.8 : z >= 14 ? 2.4 : z >= 13 ? 2 : 1.6
    // the visit area of each site
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(127,224,200,0.6)'
    for (const s of this.sites) {
      if ((this.target.get(s.id) ?? 0) <= 0) continue
      const c = this.toCanvas([s.lat, s.lon])
      const e = this.toCanvas([s.lat, s.lon + s.zoneM / mPerLon(s.lat)])
      ctx.beginPath()
      ctx.arc(c.x, c.y, Math.max(4, e.x - c.x), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])
    for (const a of this.agents) {
      const p = this.toCanvas(a.at)
      if (p.x < -5 || p.y < -5 || p.x > this.size.x + 5 || p.y > this.size.y + 5) continue
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = a.phase === 'in' ? ARRIVE : a.phase === 'out' ? LEAVE : STAY
      ctx.fill()
    }
  }
}
