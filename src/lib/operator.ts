/**
 * Operator bookings for tour coaches, carried over from the Madinah prototype
 * (dhde-ai-demo/medina): capacity per site per hourly slot counted in coaches,
 * a planner that keeps a group together and only splits it across nearby slots or
 * sibling sites when it must, schedules that arrive exactly at the booked slot, and a
 * lifecycle (upcoming → on visit → awaiting sign-off → completed).
 *
 * New here: coaches run on real road geometry (coach_legs.json, OSRM), the demo day is
 * seeded for every day on the timeline, bookings persist in this browser, and the
 * confirmation QR is a real, scannable code that opens #/verify/<booking>.
 *
 * Capacities, durations and the demo bookings are illustrative (MRDA brief); no booking
 * leaves this browser.
 */
import { useSyncExternalStore } from 'react'
import type { Site, SitesFile } from '../types/data'

export const PAX_PER_COACH = 40
export const SLOTS = ['07:00', '08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
/** Coach speed for legs without road data, km/h incl. city stops. */
const SPEED_KMH = 28

export type Weather = 'clear' | 'rain' | 'heat' | 'storm'

export interface CoachLeg {
  type: 'travel' | 'dwell'
  start: number
  end: number
  path?: [number, number][]
  site?: string
  at?: [number, number]
  isReturn?: boolean
}

export interface Booking {
  code: string
  groupCode: string
  operator: string
  value: string
  date: string
  slot: string
  groupSize: number
  coaches: number
  guide: boolean
  origin: string
  route: string[]
  km: number
  legs: CoachLeg[]
  start: number
  end: number
  signedOff: boolean
  demo: boolean
}

export interface Leg {
  km: number
  min: number
  path: [number, number][]
}

export type Phase = 'upcoming' | 'in-progress' | 'ready' | 'completed'

export const ITINERARIES = [
  { value: 'route:A', en: 'Quba cluster loop (wells, museums, Quba, al-Hayy + Qiblatain)', ar: 'جولة مجموعة قباء (الآبار والمتاحف وقباء والحي والقبلتين)' },
  { value: 'route:B', en: 'Uhud and Khandaq (Uhud summit, Sayyid al-Shuhada, al-Khandaq)', ar: 'أحد والخندق (قمة أحد وسيد الشهداء والخندق)' },
  { value: 'route:ALL', en: 'Full city (both clusters + Jabal Ayr)', ar: 'المدينة كاملة (المجموعتان + جبل عير)' },
]

export const ORIGIN_ICON: Record<string, string> = {
  haram: '🕌', 'quba-hotels': '🏨', 'airport-rd': '🏨', airport: '✈️', 'rail-station': '🚄', 'bus-terminal': '🚌', markaziya: '🏨', 'taibah-u': '🎓',
}

const DEMO_OPERATORS = ['Al-Noor Tours', 'Baraka Travel Group', 'Rawdah Pilgrim Services', 'Ihsan Coaches', 'Nur Al-Madinah Tours', 'Sakinah Travel', 'Al-Ansar Tour Co.', 'Waha Heritage Tours']

/* ---------------------------------------------------------------- context */

export interface OperatorCtx {
  sites: Site[]
  byId: Record<string, Site>
  origins: SitesFile['origins']
  legs: Record<string, Leg>
}

export function makeCtx(sites: SitesFile, legs: Record<string, Leg> | null): OperatorCtx {
  const list = sites.sites.filter((s) => s.capacity_per_slot)
  return { sites: list, byId: Object.fromEntries(sites.sites.map((s) => [s.id, s])), origins: sites.origins, legs: legs ?? {} }
}

function pointOf(ctx: OperatorCtx, id: string): [number, number] {
  const s = ctx.byId[id]
  if (s) return [s.lat, s.lon]
  const o = ctx.origins.find((x) => x.id === id)
  return o ? [o.lat, o.lon] : [24.4672, 39.6111]
}

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Road leg between two points (either direction), or a gentle curve when not fetched. */
export function legBetween(ctx: OperatorCtx, a: string, b: string): Leg {
  const f = ctx.legs[`${a}|${b}`]
  if (f) return f
  const r = ctx.legs[`${b}|${a}`]
  if (r) return { km: r.km, min: r.min, path: [...r.path].reverse() }
  const pa = pointOf(ctx, a)
  const pb = pointOf(ctx, b)
  const km = haversine(pa, pb) * 1.25
  const mx = (pa[0] + pb[0]) / 2 + (pb[1] - pa[1]) * 0.12
  const my = (pa[1] + pb[1]) / 2 - (pb[0] - pa[0]) * 0.12
  const path: [number, number][] = []
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    path.push([(1 - t) ** 2 * pa[0] + 2 * (1 - t) * t * mx + t * t * pb[0], (1 - t) ** 2 * pa[1] + 2 * (1 - t) * t * my + t * t * pb[1]])
  }
  return { km, min: (km / SPEED_KMH) * 60, path }
}

/* ---------------------------------------------------------------- planner */

export function sitesFor(ctx: OperatorCtx, value: string): string[] {
  if (value === 'route:A') return ctx.sites.filter((s) => s.cluster === 'A' || s.cluster === 'Asat').map((s) => s.id)
  if (value === 'route:B') return ctx.sites.filter((s) => s.cluster === 'B').map((s) => s.id)
  if (value === 'route:ALL') return ctx.sites.map((s) => s.id)
  return [value.replace('site:', '')]
}

/** Coaches per slot for a site, or for an itinerary its smallest site's capacity. */
export function capacityFor(ctx: OperatorCtx, value: string): number {
  return Math.min(...sitesFor(ctx, value).map((id) => ctx.byId[id]?.capacity_per_slot ?? 0)) || 2
}

export function bookedFor(bookings: Booking[], value: string, date: string, slot: string): number {
  return bookings.filter((b) => b.value === value && b.date === date && b.slot === slot).reduce((a, b) => a + b.coaches, 0)
}

/** Coaches at a site in a slot, counting itinerary bookings that include the site. */
export function siteLoad(ctx: OperatorCtx, bookings: Booking[], siteId: string, date: string, slot: string): number {
  return bookings.filter((b) => b.date === date && b.slot === slot && sitesFor(ctx, b.value).includes(siteId)).reduce((a, b) => a + b.coaches, 0)
}

/**
 * Coaches that still fit a site or itinerary in a slot: every site on it must have room,
 * so an itinerary is limited by its fullest site (an itinerary booking uses a place at each
 * of its sites in that slot window).
 */
export function remainingFor(ctx: OperatorCtx, bookings: Booking[], value: string, date: string, slot: string, extra: Record<string, number> = {}): number {
  return Math.min(
    ...sitesFor(ctx, value).map((id) => (ctx.byId[id]?.capacity_per_slot ?? 0) - siteLoad(ctx, bookings, id, date, slot) - (extra[`${id}|${slot}`] ?? 0)),
  )
}

export function unsafeSite(s: Site | undefined, weather: Weather): boolean {
  if (!s) return false
  if (weather === 'storm') return s.exposure >= 0.6
  if (weather === 'heat') return s.exposure >= 0.8
  return false
}

export function valueUnsafe(ctx: OperatorCtx, value: string, weather: Weather): boolean {
  return sitesFor(ctx, value).some((id) => unsafeSite(ctx.byId[id], weather))
}

function siblings(ctx: OperatorCtx, value: string): string[] {
  if (value.startsWith('route:')) return ['route:A', 'route:B', 'route:ALL'].filter((v) => v !== value)
  const s = ctx.byId[value.replace('site:', '')]
  return ctx.sites.filter((o) => o.id !== s?.id && o.cluster === s?.cluster).map((o) => 'site:' + o.id)
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Allocates `coaches` across the best (site/itinerary, slot) combinations: the exact
 * request first, then nearby slots at the same place, then sibling sites in the cluster.
 * Keeps the group together where it can and only splits when it must.
 */
export function planBooking(ctx: OperatorCtx, bookings: Booking[], value: string, date: string, slot: string, coaches: number, weather: Weather, afterMin = -1) {
  const candidates = [value, ...siblings(ctx, value)].filter((v) => !valueUnsafe(ctx, v, weather))
  const idx = SLOTS.indexOf(slot)
  const open = SLOTS.filter((s) => toMin(s) > afterMin)
  const order = candidates
    .flatMap((v, rank) => open.map((s) => ({ v, s, rank })))
    .sort((a, b) => a.rank - b.rank || Math.abs(SLOTS.indexOf(a.s) - idx) - Math.abs(SLOTS.indexOf(b.s) - idx))
  // coaches taken so far in this plan, per site and slot
  const used: Record<string, number> = {}
  const chunks: { value: string; slot: string; coaches: number }[] = []
  let left = coaches
  for (const c of order) {
    if (left <= 0) break
    const room = remainingFor(ctx, bookings, c.v, date, c.s, used)
    if (room <= 0) continue
    const take = Math.min(room, left)
    for (const id of sitesFor(ctx, c.v)) used[`${id}|${c.s}`] = (used[`${id}|${c.s}`] ?? 0) + take
    chunks.push({ value: c.v, slot: c.s, coaches: take })
    left -= take
  }
  return { chunks, unallocated: left }
}

/** Nearest-neighbour visiting order from the starting point (as in the prototype). */
export function buildRoute(ctx: OperatorCtx, origin: string, siteIds: string[]) {
  const rest = [...siteIds]
  const order: string[] = []
  let cur = origin
  let km = 0
  while (rest.length) {
    let best = 0
    let bestKm = Infinity
    rest.forEach((id, i) => {
      const k = legBetween(ctx, cur, id).km
      if (k < bestKm) {
        bestKm = k
        best = i
      }
    })
    const id = rest.splice(best, 1)[0]
    order.push(id)
    km += bestKm
    cur = id
  }
  return { order, km }
}

/** Travel, dwell, travel… return: arrives at the first site exactly at the slot. */
export function buildSchedule(ctx: OperatorCtx, origin: string, order: string[], slot: string) {
  const legs: CoachLeg[] = []
  const first = legBetween(ctx, origin, order[0])
  let t = toMin(slot) - first.min
  const start = t
  let from = origin
  order.forEach((id) => {
    const lg = legBetween(ctx, from, id)
    legs.push({ type: 'travel', start: t, end: t + lg.min, path: lg.path })
    t += lg.min
    const s = ctx.byId[id]
    legs.push({ type: 'dwell', start: t, end: t + (s?.typical_visit_min ?? 30), site: id, at: pointOf(ctx, id) })
    t += s?.typical_visit_min ?? 30
    from = id
  })
  const back = legBetween(ctx, from, origin)
  legs.push({ type: 'travel', start: t, end: t + back.min, path: back.path, isReturn: true })
  t += back.min
  return { legs, start, end: t }
}

export function confirmationCode(seed?: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let h = 2166136261
  const src = seed ?? `${Date.now()}-${Math.random()}`
  let code = ''
  for (let i = 0; i < 6; i++) {
    for (const c of src + i) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
    code += chars[h % chars.length]
  }
  return `MAD-${new Date().getFullYear()}-${code}`
}

export interface Request {
  operator: string
  value: string
  date: string
  slot: string
  origin: string
  coaches: number
  groupSize: number
  guide: boolean
}

export function createBooking(ctx: OperatorCtx, bookings: Booking[], req: Request, weather: Weather, demo = false, afterMin = -1): Booking[] {
  const plan = planBooking(ctx, bookings, req.value, req.date, req.slot, req.coaches, weather, afterMin)
  if (!plan.chunks.length) return []
  const group = confirmationCode(demo ? `${req.date}${req.operator}${req.value}${req.slot}${req.origin}` : undefined)
  return plan.chunks.map((c, i) => {
    const route = buildRoute(ctx, req.origin, sitesFor(ctx, c.value))
    const sch = buildSchedule(ctx, req.origin, route.order, c.slot)
    return {
      code: plan.chunks.length > 1 ? `${group}-${i + 1}` : group,
      groupCode: group,
      operator: req.operator,
      value: c.value,
      date: req.date,
      slot: c.slot,
      groupSize: Math.max(1, Math.round((req.groupSize * c.coaches) / req.coaches)),
      coaches: c.coaches,
      guide: req.guide,
      origin: req.origin,
      route: route.order,
      km: route.km,
      legs: sch.legs,
      start: sch.start,
      end: sch.end,
      signedOff: false,
      demo,
    }
  })
}

/** A full illustrative day of coach traffic for a date (the prototype's 13 requests). */
export function seedDemoDay(ctx: OperatorCtx, date: string): Booking[] {
  const reqs: [string, string, string, number, boolean][] = [
    ['airport', 'route:ALL', '08:00', 2, true],
    ['haram', 'route:A', '09:00', 3, true],
    ['haram', 'route:B', '07:00', 1, false],
    ['quba-hotels', 'site:quba', '08:00', 1, false],
    ['quba-hotels', 'site:qiblatain', '16:00', 2, true],
    ['airport-rd', 'route:A', '11:00', 2, false],
    ['haram', 'site:uhud', '13:00', 1, true],
    ['rail-station', 'route:ALL', '14:00', 1, false],
    ['quba-hotels', 'site:faqir-well', '09:00', 2, false],
    ['haram', 'route:A', '15:00', 2, true],
    ['airport-rd', 'site:faqir-well', '09:00', 2, false],
    ['markaziya', 'site:al-khandaq', '10:00', 2, false],
    ['rail-station', 'site:shuhada', '17:00', 3, true],
  ]
  const out: Booking[] = []
  reqs.forEach(([origin, value, slot, coaches, guide], i) => {
    out.push(
      ...createBooking(ctx, out, { operator: DEMO_OPERATORS[i % DEMO_OPERATORS.length], value, date, slot, origin, coaches, groupSize: coaches * PAX_PER_COACH, guide }, 'clear', true),
    )
  })
  return out
}

export function phaseOf(b: Booking, today: string, nowMin: number): Phase {
  if (b.signedOff) return 'completed'
  if (b.date > today) return 'upcoming'
  if (b.date < today) return 'ready'
  if (nowMin < b.start) return 'upcoming'
  if (nowMin <= b.end) return 'in-progress'
  return 'ready'
}

export const PHASE_LABEL: Record<Phase, [string, string]> = {
  upcoming: ['Upcoming', 'قادم'],
  'in-progress': ['On visit', 'في الزيارة'],
  ready: ['Awaiting sign-off', 'بانتظار التوقيع'],
  completed: ['Completed', 'مكتمل'],
}

/* ---------------------------------------------------------------- position on the map */

function alongPath(path: [number, number][], f: number): [number, number] {
  if (path.length < 2) return path[0]
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], (path[i][1] - path[i - 1][1]) * 0.91)
    seg.push(d)
    total += d
  }
  let target = Math.max(0, Math.min(1, f)) * total
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]) {
      const g = seg[i] ? target / seg[i] : 0
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * g, path[i][1] + (path[i + 1][1] - path[i][1]) * g]
    }
    target -= seg[i]
  }
  return path[path.length - 1]
}

/** Where a coach is at minute m of its day: on a road, or parked at a site. */
export function coachAt(b: Booking, m: number): { at: [number, number]; moving: boolean; isReturn: boolean; site?: string } | null {
  if (m < b.start || m > b.end) return null
  for (const leg of b.legs) {
    if (m <= leg.end) {
      if (leg.type === 'dwell') return { at: leg.at!, moving: false, isReturn: false, site: leg.site }
      const span = leg.end - leg.start
      return { at: alongPath(leg.path!, span > 0 ? (m - leg.start) / span : 1), moving: true, isReturn: Boolean(leg.isReturn) }
    }
  }
  return null
}

/* ---------------------------------------------------------------- store (this browser) */

const KEY = 'dhde-madinah.bookings'
const MODE_KEY = 'dhde-madinah.operatorMode'
const WX_KEY = 'dhde-madinah.weather'

interface State {
  mine: Booking[]
  signed: string[]
  mode: 'demo' | 'manual'
  weather: Weather
}

function read(): State {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<State>
    return {
      mine: raw.mine ?? [],
      signed: raw.signed ?? [],
      mode: (window.localStorage.getItem(MODE_KEY) as State['mode']) ?? 'demo',
      weather: (window.localStorage.getItem(WX_KEY) as Weather) ?? 'clear',
    }
  } catch {
    return { mine: [], signed: [], mode: 'demo', weather: 'clear' }
  }
}

let state: State = typeof window === 'undefined' ? { mine: [], signed: [], mode: 'demo', weather: 'clear' } : read()
const listeners = new Set<() => void>()

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ mine: state.mine, signed: state.signed }))
    window.localStorage.setItem(MODE_KEY, state.mode)
    window.localStorage.setItem(WX_KEY, state.weather)
  } catch {
    /* storage blocked: bookings last for this visit */
  }
  listeners.forEach((l) => l())
}

export const operatorStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => state,
  add(b: Booking[]) {
    state = { ...state, mine: [...state.mine, ...b] }
    save()
  },
  signOff(code: string) {
    state = { ...state, signed: [...new Set([...state.signed, code])] }
    save()
  },
  clear() {
    state = { ...state, mine: [], signed: [] }
    save()
  },
  setMode(mode: State['mode']) {
    state = { ...state, mode }
    save()
  },
  setWeather(weather: Weather) {
    state = { ...state, weather }
    save()
  },
}

export function useOperatorState(): State {
  return useSyncExternalStore(operatorStore.subscribe, operatorStore.get, operatorStore.get)
}

const demoCache = new Map<string, Booking[]>()

/** Every booking for the given dates: the demo day (in demo mode) plus this browser's own. */
export function allBookings(ctx: OperatorCtx | null, st: State, dates: string[]): Booking[] {
  if (!ctx) return []
  const demo =
    st.mode === 'demo'
      ? dates.flatMap((d) => {
          if (!demoCache.has(d)) demoCache.set(d, seedDemoDay(ctx, d))
          return demoCache.get(d)!
        })
      : []
  const signed = new Set(st.signed)
  return [...demo, ...st.mine].map((b) => (signed.has(b.code) ? { ...b, signedOff: true } : b))
}

/* ---------------------------------------------------------------- QR payload */

export interface Ticket {
  c: string
  o: string
  v: string
  d: string
  s: string
  n: number
  k: number
  g: boolean
  f: string
}

export function ticketOf(b: Booking): Ticket {
  return { c: b.code, o: b.operator, v: b.value, d: b.date, s: b.slot, n: b.groupSize, k: b.coaches, g: b.guide, f: b.origin }
}

export function encodeTicket(t: Ticket): string {
  const bytes = new TextEncoder().encode(JSON.stringify(t))
  let bin = ''
  bytes.forEach((x) => (bin += String.fromCharCode(x)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeTicket(s: string): Ticket | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const t = JSON.parse(new TextDecoder().decode(bytes)) as Ticket
    return t.c && t.d ? t : null
  } catch {
    return null
  }
}

export function verifyUrl(b: Booking): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#/verify/${encodeTicket(ticketOf(b))}`
}
