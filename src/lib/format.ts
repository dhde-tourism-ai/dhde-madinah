import type { Lang } from './i18n'

const loc = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')

export function fmtNum(n: number | null | undefined, lang: Lang = 'en', digits = 0): string {
  if (n == null || Number.isNaN(n)) return '–'
  return n.toLocaleString(loc(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

/** 12,400 → "12.4k", 3,200,000 → "3.2M" */
export function fmtCompact(n: number | null | undefined, lang: Lang = 'en'): string {
  if (n == null || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat(loc(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function fmtSar(n: number | null | undefined, lang: Lang = 'en'): string {
  if (n == null || Number.isNaN(n)) return '–'
  return `${fmtCompact(n, lang)} ${lang === 'ar' ? 'ر.س' : 'SAR'}`
}

export function fmtPct(share: number | null | undefined, lang: Lang = 'en', digits = 0): string {
  if (share == null || Number.isNaN(share)) return '–'
  return `${fmtNum(share * 100, lang, digits)}%`
}

export function fmtHour(h: number): string {
  return `${String(Math.floor(h) % 24).padStart(2, '0')}:00`
}

export function fmtDate(iso: string, lang: Lang = 'en', opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(loc(lang), opts)
}

export function km(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
