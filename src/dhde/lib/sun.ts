/**
 * Sun position for Madinah (NOAA's simplified solar equations, accurate to well under a
 * degree): elevation and azimuth for a Riyadh-time date and hour, and building shadows.
 */
const RAD = Math.PI / 180

export interface Sun {
  /** Degrees above the horizon (negative at night). */
  elevation: number
  /** Degrees clockwise from north. */
  azimuth: number
}

export function sunAt(isoDate: string, hourLocal: number, lat = 24.467, lon = 39.611, tzHours = 3): Sun {
  const d = new Date(`${isoDate}T12:00:00Z`)
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  const doy = Math.floor((d.getTime() - start) / 86400000)
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hourLocal - 12) / 24)
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const tst = hourLocal * 60 + eqTime + 4 * lon - 60 * tzHours
  const ha = (tst / 4 - 180) * RAD
  const phi = lat * RAD
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)))
  const elevation = 90 - zen / RAD
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180
  az = (az + 360) % 360
  return { elevation, azimuth: az }
}

/** Shadow offset in metres (east, north) for a height h under the sun; null at night. */
export function shadowVector(sun: Sun, h: number): [number, number] | null {
  if (sun.elevation <= 1) return null
  const len = Math.min(h / Math.tan(sun.elevation * RAD), h * 25)
  const b = (sun.azimuth + 180) * RAD
  return [Math.sin(b) * len, Math.cos(b) * len]
}

/** Compass words for the sun's direction. */
export function compass(az: number): [string, string] {
  const en = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  const ar = ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي']
  const i = Math.round(az / 45) % 8
  return [en[i], ar[i]]
}
