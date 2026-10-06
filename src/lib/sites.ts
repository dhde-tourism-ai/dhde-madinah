import type { Site, TelecomFile } from '../types/data'

/** Cluster colours (series palette from tokens.css), always shown with the cluster name. */
export const CLUSTER: Record<string, { colour: string; en: string; ar: string }> = {
  center: { colour: '#8b9dff', en: 'Central area', ar: 'المنطقة المركزية' },
  A: { colour: '#199e70', en: 'Quba cluster', ar: 'مجموعة قباء' },
  Asat: { colour: '#199e70', en: 'Quba cluster (satellite)', ar: 'مجموعة قباء (تابع)' },
  B: { colour: '#c98500', en: 'Uhud and Khandaq', ar: 'أحد والخندق' },
  outlier: { colour: '#e66767', en: 'Stand-alone', ar: 'مستقل' },
}

export function clusterOf(s: Site) {
  return CLUSTER[s.cluster] ?? CLUSTER.A
}

/** Devices present at a site in hour index i (day*24+hour); null when suppressed (< k devices). */
export function presenceAt(tel: TelecomFile | null, siteId: string, i: number): number | null {
  const s = tel?.sites[siteId]
  if (!s) return null
  return s.hourly[i] ?? null
}

export function dayIndex(tel: TelecomFile | null, date: string): number {
  return Math.max(0, tel?.days.findIndex((d) => d.date === date) ?? 0)
}

/** Peak presence across all hours for one site (for scaling markers). */
export function peakPresence(tel: TelecomFile | null, siteId: string): number {
  const h = tel?.sites[siteId]?.hourly ?? []
  return h.reduce<number>((m, v) => Math.max(m, v ?? 0), 0)
}

/** Proposed visitor-day value: on-site card spend per device (demo). */
export function spendPerVisitor(tel: TelecomFile, siteId: string, day = 0): number {
  const s = tel.sites[siteId]
  if (!s) return 0
  const total = Object.values(s.spend_sar_day).reduce((a, b) => a + b, 0)
  return total / Math.max(1, s.daily_devices[day])
}
