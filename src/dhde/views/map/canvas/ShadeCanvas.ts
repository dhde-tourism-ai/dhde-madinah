import { CanvasOverlay } from './CanvasOverlay'
import type { Ring, Shadow } from '../../../lib/shade'
import type { Sun } from '../../../lib/sun'

/**
 * Sun and shade on the ground for the hour:
 *  - building shadows in deep blue (drawn once onto a buffer so overlaps don't darken twice)
 *  - each site's visit area in warm amber where it is in direct sun, so sun vs shade reads on
 *    any basemap (the shaded parts are cut out of the amber)
 * At night nothing is drawn: the whole ground is in shade.
 */
export class ShadeCanvas extends CanvasOverlay {
  private shadows: Shadow[] = []
  private areas: Ring[] = []
  private sun: Sun | null = null
  private buf: HTMLCanvasElement | null = null
  private sunBuf: HTMLCanvasElement | null = null

  constructor() {
    super('dhde-shade', 340)
  }

  setData(shadows: Shadow[], sun: Sun, areas: Ring[]) {
    this.shadows = shadows
    this.sun = sun
    this.areas = areas
    this.redraw()
  }

  private path(c: CanvasRenderingContext2D, ring: Ring) {
    c.beginPath()
    ring.forEach((p, i) => {
      const q = this.toCanvas(p)
      if (i) c.lineTo(q.x, q.y)
      else c.moveTo(q.x, q.y)
    })
    c.closePath()
  }

  private layer(ctx: CanvasRenderingContext2D, key: 'buf' | 'sunBuf'): CanvasRenderingContext2D {
    if (!this[key]) this[key] = document.createElement('canvas')
    const b = this[key]!
    b.width = ctx.canvas.width
    b.height = ctx.canvas.height
    const o = b.getContext('2d')!
    o.setTransform(ctx.getTransform())
    return o
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const sun = this.sun
    if (!sun || sun.elevation <= 1) return

    // sunlit ground at the sites: amber, minus the shadows
    const s = this.layer(ctx, 'sunBuf')
    s.fillStyle = '#ffb547'
    for (const a of this.areas) {
      this.path(s, a)
      s.fill()
    }
    s.globalCompositeOperation = 'destination-out'
    s.fillStyle = '#000'
    for (const sh of this.shadows) {
      this.path(s, sh.ring)
      s.fill()
    }
    s.globalCompositeOperation = 'source-over'

    // shadows: deep blue
    const o = this.layer(ctx, 'buf')
    o.fillStyle = '#16245c'
    for (const sh of this.shadows) {
      this.path(o, sh.ring)
      o.fill()
    }

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 0.6
    ctx.drawImage(o.canvas, 0, 0)
    ctx.globalAlpha = 0.42
    ctx.drawImage(s.canvas, 0, 0)
    ctx.restore()
  }
}
