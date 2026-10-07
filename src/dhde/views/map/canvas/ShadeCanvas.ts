import { CanvasOverlay } from './CanvasOverlay'
import type { Shadow } from '../../../lib/shade'
import type { Sun } from '../../../lib/sun'

/**
 * Building shadows for the hour (drawn once onto an offscreen layer so overlaps don't
 * darken twice), plus a sun compass in the corner: where the sun is and how high.
 */
export class ShadeCanvas extends CanvasOverlay {
  private shadows: Shadow[] = []
  private sun: Sun | null = null
  private buf: HTMLCanvasElement | null = null

  constructor() {
    super('dhde-shade', 340)
  }

  setData(shadows: Shadow[], sun: Sun) {
    this.shadows = shadows
    this.sun = sun
    this.redraw()
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const w = this.size.x
    const h = this.size.y
    if (!this.buf) this.buf = document.createElement('canvas')
    const off = this.buf
    off.width = ctx.canvas.width
    off.height = ctx.canvas.height
    const o = off.getContext('2d')!
    o.setTransform(ctx.getTransform())
    o.fillStyle = '#05080f'
    for (const s of this.shadows) {
      o.beginPath()
      s.ring.forEach((p, i) => {
        const c = this.toCanvas(p)
        if (i) o.lineTo(c.x, c.y)
        else o.moveTo(c.x, c.y)
      })
      o.closePath()
      o.fill()
    }
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 0.5
    ctx.drawImage(off, 0, 0)
    ctx.restore()

    // sun rays across the view, pointing where light comes from
    const sun = this.sun
    if (sun && sun.elevation > 1) {
      const b = (sun.azimuth * Math.PI) / 180
      const dx = Math.sin(b)
      const dy = -Math.cos(b)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,209,102,0.10)'
      ctx.lineWidth = 2
      for (let k = -6; k <= 6; k++) {
        const cx = w / 2 + -dy * k * 140
        const cy = h / 2 + dx * k * 140
        ctx.beginPath()
        ctx.moveTo(cx - dx * 2000, cy - dy * 2000)
        ctx.lineTo(cx + dx * 2000, cy + dy * 2000)
        ctx.stroke()
      }
      ctx.restore()
    }
  }
}

