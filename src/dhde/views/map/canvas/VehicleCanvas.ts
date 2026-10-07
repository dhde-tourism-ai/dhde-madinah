import type L from 'leaflet'
import { CanvasOverlay } from './CanvasOverlay'
import { vehicleClock } from '../../../lib/vehicleClock'
import { trainsAt } from '../../../lib/railModel'
import { alongPath } from '../../../lib/busPath'
import type { SnappedTrip } from '../../../lib/busPath'
import type { RailRun } from '../../../lib/railModel'
import { drawBus } from './busGlyph'

/** A bus trip: stop positions and the departure minute at each, in calling order. */
export interface BusTrip {
  pts: [number, number][]
  min: number[]
  /** The stops placed on the route's line; without it the bus runs straight between stops. */
  snap: SnappedTrip | null
  /** Line colour: the bus icon is drawn in it. */
  colour?: string
}

export interface VehicleStyle {
  bus: string
  train: string
}

/**
 * Moving buses and trains on vehicleClock: buses where their timetable puts them
 * (straight between stops), trains on the illustrative rail model (lib/railModel),
 * stopping at stations.
 */
export class VehicleCanvas extends CanvasOverlay {
  private buses: BusTrip[] = []
  private rail: RailRun[] = []
  private legCache = new Map()
  private style: VehicleStyle
  private raf = 0

  constructor(style: VehicleStyle) {
    super('dhde-vehicles', 465)
    this.style = style
  }

  onAdd(map: L.Map): this {
    super.onAdd(map)
    const loop = () => {
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

  setData(buses: BusTrip[], rail: RailRun[]) {
    this.buses = buses
    if (rail !== this.rail) this.legCache = new Map()
    this.rail = rail
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const m = vehicleClock.minute()
    const w = this.size.x
    const h = this.size.y
    // Small at the prefecture view, a little larger as you zoom in (matching the stop and station dots).
    const z = this._map.getZoom()
    const trainR = z >= 14 ? 3 : z >= 12 ? 2.4 : 2
    // Bus icons from street level; dots when zoomed out so the network stays readable.
    const busS = z >= 15 ? 13 : z >= 14 ? 11 : z >= 13 ? 9 : 4
    const dot = (p: L.Point, r: number, fill: string) => {
      if (p.x < -10 || p.y < -10 || p.x > w + 10 || p.y > h + 10) return
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 0.75, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
    }

    for (const r of this.rail) for (const ll of trainsAt(r, m, this.legCache)) dot(this.toCanvas(ll), trainR, this.style.train)

    for (const b of this.buses) {
      const n = b.min.length
      if (m < b.min[0] || m > b.min[n - 1]) continue
      let i = 0
      while (i < n - 2 && b.min[i + 1] <= m) i++
      const span = b.min[i + 1] - b.min[i]
      const f = span > 0 ? Math.min(1, (m - b.min[i]) / span) : 0
      let at: [number, number]
      // Along the line; straight only on a leg to or from a stop the line doesn't reach.
      const d0 = b.snap?.d[i] ?? NaN
      const d1 = b.snap?.d[i + 1] ?? NaN
      if (b.snap && !Number.isNaN(d0) && !Number.isNaN(d1)) at = alongPath(b.snap, d0 + (d1 - d0) * f)
      else {
        const a = b.pts[i]
        const c = b.pts[i + 1]
        at = [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f]
      }
      const p = this.toCanvas(at)
      if (p.x < -12 || p.y < -12 || p.x > w + 12 || p.y > h + 12) continue
      drawBus(ctx, p.x, p.y, busS, b.colour ?? this.style.bus)
    }
  }
}
