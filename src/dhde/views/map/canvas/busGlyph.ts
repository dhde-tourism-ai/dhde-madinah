/**
 * A small bus pictogram for canvas layers: rounded body in the line or cluster colour,
 * a white outline, a windscreen band and two wheels. `s` is the body width in px.
 * Below a few px it falls back to a dot, so zoomed-out views stay readable.
 */
export function drawBus(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, opts: { ring?: string; dim?: boolean } = {}) {
  if (s < 6) {
    ctx.beginPath()
    ctx.arc(x, y, s / 2 + 0.75, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, s / 2, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    return
  }
  const w = s
  const h = s * 0.82
  const r = s * 0.2
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
  // outline
  ctx.beginPath()
  ctx.roundRect(x0 - 1.2, y0 - 1.2, w + 2.4, h + 2.4, r + 1)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  // body
  ctx.beginPath()
  ctx.roundRect(x0, y0, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  // windscreen
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(x0 + w * 0.16, y0 + h * 0.16, w * 0.68, h * 0.3)
  // wheels
  ctx.fillStyle = '#0a1120'
  ctx.beginPath()
  ctx.arc(x0 + w * 0.27, y0 + h * 0.8, s * 0.09, 0, Math.PI * 2)
  ctx.arc(x0 + w * 0.73, y0 + h * 0.8, s * 0.09, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
