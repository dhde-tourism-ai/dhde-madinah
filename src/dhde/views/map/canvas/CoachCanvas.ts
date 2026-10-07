import type L from 'leaflet'
import { CanvasOverlay } from './CanvasOverlay'
import { vehicleClock } from '../../../lib/vehicleClock'
import { drawBus } from './busGlyph'
import { coachAt } from '../../../../lib/operator'
import type { Booking } from '../../../../lib/operator'

export interface CoachItem {
  b: Booking
  colour: string
}

/**
 * Booked tour coaches (operator console) on the shared vehicleClock: on the road to and
 * between their sites, parked while the group visits (with a ring), grey on the way back.
 * Coaches parked at the same site fan out so a busy site reads as busy.
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
    return super.onRemove(map)
  }

  setData(items: CoachItem[]) {
    this.items = items
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const date = vehicleClock.date()
    const m = vehicleClock.minute()
    const z = this._map.getZoom()
    const s = z >= 15 ? 16 : z >= 13 ? 13 : z >= 12 ? 11 : 8
    const parked = new Map<string, number>()
    for (const { b, colour } of this.items) {
      if (b.date !== date) continue
      const pos = coachAt(b, m)
      if (!pos) continue
      for (let k = 0; k < b.coaches; k++) {
        let at = pos.at
        if (!pos.moving) {
          const n = parked.get(pos.site ?? '') ?? 0
          parked.set(pos.site ?? '', n + 1)
          const ang = n * 2.4
          const r = n ? 0.00035 + n * 0.00006 : 0
          at = [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r]
        } else if (k > 0) {
          at = [at[0] + k * 0.00018, at[1] + k * 0.00018]
        }
        const p = this.toCanvas(at)
        drawBus(ctx, p.x, p.y, s, pos.isReturn ? '#8a94a6' : colour, { ring: pos.moving ? undefined : 'rgba(255,255,255,0.18)' })
      }
    }
  }
}
