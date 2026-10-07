import type L from 'leaflet'
import { CanvasOverlay } from './CanvasOverlay'
import { vehicleClock, clock } from '../../../lib/vehicleClock'
import { trainsInfoAt } from '../../../lib/railModel'
import { alongPath } from '../../../lib/busPath'
import type { SnappedTrip } from '../../../lib/busPath'
import type { RailRun } from '../../../lib/railModel'
import { drawBus, drawTrain } from './busGlyph'
import { clearHits, setHits } from './hits'
import type { Hit } from './hits'

/** A bus trip: stop positions and the departure minute at each, in calling order. */
export interface BusTrip {
  pts: [number, number][]
  min: number[]
  /** The stops placed on the route's line; without it the bus runs straight between stops. */
  snap: SnappedTrip | null
  /** Line colour: the bus icon is drawn in it. */
  colour?: string
  /** Line name and stop names, for the hover card. */
  line?: string
  stopNames?: string[]
}

export interface VehicleStyle {
  bus: string
  train: string
}

const HITS = 'vehicles'

/**
 * Moving city buses and trains on vehicleClock: buses where their timetable puts them
 * (along their line between stops), trains on the rail model (the official Haramain
 * timetable at Madinah station), stopping at stations. Each is drawn as its own pictogram
 * and registered for hover cards.
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
    clearHits(HITS)
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
    const z = this._map.getZoom()
    const trainS = z >= 14 ? 12 : z >= 12 ? 9 : 7
    // Bus icons from street level; dots when zoomed out so the network stays readable.
    const busS = z >= 15 ? 13 : z >= 14 ? 11 : z >= 13 ? 9 : 4
    const hits: Hit[] = []
    const inView = (p: L.Point) => p.x >= -14 && p.y >= -14 && p.x <= w + 14 && p.y <= h + 14

    for (const r of this.rail) {
      for (const tr of trainsInfoAt(r, m, this.legCache)) {
        const p = this.toCanvas(tr.at)
        if (!inView(p)) continue
        drawTrain(ctx, p.x, p.y, trainS, this.style.train)
        const c = this._map.latLngToContainerPoint(tr.at)
        hits.push({
          x: c.x,
          y: c.y,
          r: trainS,
          kind: 'train',
          title: r.lineName[0],
          lines: [tr.arriving ? `Arriving at Madinah ${clock(tr.stationMin)}` : `Left Madinah ${clock(tr.stationMin)}`, r.fixed ? 'Official timetable (sar.hhr.sa)' : 'Illustrative service'],
        })
      }
    }

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
      if (!inView(p)) continue
      drawBus(ctx, p.x, p.y, busS, b.colour ?? this.style.bus)
      if (busS >= 6) {
        const c = this._map.latLngToContainerPoint(at)
        const next = b.stopNames?.[i + 1]
        hits.push({
          x: c.x,
          y: c.y,
          r: busS / 2 + 2,
          kind: 'bus',
          title: `City bus · ${b.line ?? 'Madinah Bus'}`,
          lines: [next ? `Next stop: ${next} at ${clock(b.min[i + 1])}` : `Next stop at ${clock(b.min[i + 1])}`, `Terminus ${clock(b.min[n - 1])} · timetable estimated from published hours`],
        })
      }
    }
    setHits(HITS, hits)
  }
}
