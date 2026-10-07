/**
 * Vehicle pictograms for the canvas layers, so modes read apart at a glance:
 *  - city bus (drawBus): a squarish body in the line colour, windscreen and two wheels
 *  - private tour coach (drawCoach): a longer body in the cluster colour with a gold roof
 *    stripe and a row of windows
 *  - train (drawTrain): a long white capsule with a red band (Haramain livery)
 * All have a white outline so they stand out on imagery. Below a few px they become dots.
 */

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath()
  ctx.arc(x, y, r + 0.75, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

function wheels(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, s: number) {
  ctx.fillStyle = '#0a1120'
  ctx.beginPath()
  ctx.arc(x0 + w * 0.24, y0 + h, s * 0.1, 0, Math.PI * 2)
  ctx.arc(x0 + w * 0.76, y0 + h, s * 0.1, 0, Math.PI * 2)
  ctx.fill()
}

export function drawBus(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, opts: { ring?: string; dim?: boolean } = {}) {
  if (s < 6) return dot(ctx, x, y, s / 2, fill)
  const w = s
  const h = s * 0.82
  const x0 = x - w / 2
  const y0 = y - h / 2
  ctx.save()
  if (opts.dim) ctx.globalAlpha = 0.55
  if (opts.ring) {
    ctx.beginPath()
    ctx.arc(x, y, s * 0.95, 0, Math.PI * 2)
    ctx.fillStyle = opts.ring
    ctx.fill()
  }
  ctx.beginPath()
  ctx.roundRect(x0 - 1.2, y0 - 1.2, w + 2.4, h + 2.4, s * 0.22)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x0, y0, w, h, s * 0.2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(x0 + w * 0.16, y0 + h * 0.16, w * 0.68, h * 0.3)
  wheels(ctx, x0, y0 + h * 0.62, w, h * 0.3, s)
  ctx.restore()
}

export function drawCoach(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, opts: { ring?: string; dim?: boolean } = {}) {
  if (s < 7) return dot(ctx, x, y, s / 2, fill)
  const w = s * 1.6
  const h = s * 0.78
  const x0 = x - w / 2
  const y0 = y - h / 2
  ctx.save()
  if (opts.dim) ctx.globalAlpha = 0.6
  if (opts.ring) {
    ctx.beginPath()
    ctx.ellipse(x, y, w * 0.72, h * 1.05, 0, 0, Math.PI * 2)
    ctx.fillStyle = opts.ring
    ctx.fill()
  }
  ctx.beginPath()
  ctx.roundRect(x0 - 1.3, y0 - 1.3, w + 2.6, h + 2.6, s * 0.2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x0, y0, w, h, s * 0.18)
  ctx.fillStyle = fill
  ctx.fill()
  // gold roof stripe: a private coach
  ctx.fillStyle = '#ffd166'
  ctx.fillRect(x0 + 1, y0 + 1, w - 2, Math.max(1.5, h * 0.16))
  // window row
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  const n = 4
  const gap = w * 0.05
  const ww = (w * 0.86 - gap * (n - 1)) / n
  for (let i = 0; i < n; i++) ctx.fillRect(x0 + w * 0.07 + i * (ww + gap), y0 + h * 0.28, ww, h * 0.28)
  wheels(ctx, x0, y0 + h * 0.66, w, h * 0.3, s)
  ctx.restore()
}

export function drawTrain(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, band = '#d03b3b') {
  if (s < 7) return dot(ctx, x, y, s / 2.4, band)
  const w = s * 2.1
  const h = s * 0.7
  const x0 = x - w / 2
  const y0 = y - h / 2
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x0 - 1.3, y0 - 1.3, w + 2.6, h + 2.6, h)
  ctx.fillStyle = '#0a1120'
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x0, y0, w, h, h / 2)
  ctx.fillStyle = '#f4f6fb'
  ctx.fill()
  ctx.fillStyle = band
  ctx.fillRect(x0 + h * 0.3, y0 + h * 0.58, w - h * 0.6, h * 0.18)
  ctx.fillStyle = 'rgba(20,35,60,0.75)'
  ctx.fillRect(x0 + h * 0.45, y0 + h * 0.2, w - h * 0.9, h * 0.25)
  ctx.restore()
}
