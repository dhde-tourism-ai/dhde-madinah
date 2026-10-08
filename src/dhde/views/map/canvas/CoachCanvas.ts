import type L from 'leaflet'
import { CanvasOverlay } from './CanvasOverlay'
import { vehicleClock, clock } from '../../../lib/vehicleClock'
import { drawCoachEmoji } from './busGlyph'
import { clearHits, setHits } from './hits'
import type { Hit } from './hits'
import { coachAt } from '../../../../lib/operator'
import type { Booking } from '../../../../lib/operator'

export interface CoachItem {
  b: Booking
  colour: string
  /** Site id → short name, and origin id → label, for the hover card. */
  siteName: (id: string) => string
  originName: string
}

const HITS = 'coaches'

/** What the coach is doing at minute m: next arrival, current visit, or the return. */
function status(item: CoachItem, m: number): string[] {
  const { b, siteName, originName } = item
  for (let i = 0; i < b.legs.length; i++) {
    const leg = b.legs[i]
    if (m > leg.end) continue
    if (leg.type === 'dwell') return [`At ${siteName(leg.site!)} until ${clock(leg.end)}`, `Group of ${b.groupSize}${b.guide ? ' with guide' : ''}`]
    if (leg.isReturn) return [`Returning to ${originName}`, `Back at ${clock(leg.end)}`]
    const next = b.legs[i + 1]
    return [`Next: ${siteName(next?.site ?? '')} at ${clock(leg.end)} (in ${Math.max(0, Math.round(leg.end - m))} min)`, `Booked slot ${b.slot} · from ${originName}`]
  }
  return []
}

/**
 * Booked private tour coaches (operator console) on the shared vehicleClock: on the road
 * to and between their sites, parked while the group visits (with a halo), grey on the way
 * back. Coaches parked at one site fan out so a busy site reads as busy.
 */
export class CoachCanvas extends CanvasOverlay {
  private items: CoachItem[] = []
  private raf = 0

  constructor() {
    // Above the site circles (500) so parked coaches show; below the site cards (620).
    super('dhde-coaches', 610)
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

  setData(items: CoachItem[]) {
    this.items = items
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const date = vehicleClock.date()
    const m = vehicleClock.minute()
    const z = this._map.getZoom()
    // large and clear, as in the Madinah prototype
    const s = z >= 15 ? 40 : z >= 13 ? 34 : z >= 12 ? 28 : 22
    const parked = new Map<string, number>()
    const hits: Hit[] = []
    for (const item of this.items) {
      const { b, colour } = item
      if (b.date !== date) continue
      const pos = coachAt(b, m)
      if (!pos) continue
      for (let k = 0; k < b.coaches; k++) {
        let at = pos.at
        if (!pos.moving) {
          const n = parked.get(pos.site ?? '') ?? 0
          parked.set(pos.site ?? '', n + 1)
          const ang = n * 2.4
          const r = n ? 0.0006 + n * 0.0001 : 0
          at = [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r]
        } else if (k > 0) {
          at = [at[0] + k * 0.0002, at[1] + k * 0.0002]
        }
        const p = this.toCanvas(at)
        drawCoachEmoji(ctx, p.x, p.y, s, pos.isReturn ? '#8a94a6' : colour, { parked: !pos.moving })
        const c = this._map.latLngToContainerPoint(at)
        hits.push({
          x: c.x,
          y: c.y,
          r: s * 0.62,
          kind: 'coach',
          title: `Private coach · ${b.operator}`,
          lines: [`${b.code}${b.coaches > 1 ? ` (coach ${k + 1} of ${b.coaches})` : ''}`, ...status(item, m)],
        })
      }
    }
    setHits(HITS, hits)
  }
}
