/**
 * The clock the map's moving buses and trains (and their stop schedules) run on.
 *
 * - live: the timeline is at Now and not playing. Vehicles run on the real clock
 *   (Riyadh time), at real speed, on today's timetable. Positions are scheduled, not GPS.
 * - preview: any other hour, or playing. The clock runs through that hour a minute
 *   a second (or the whole hour per timeline step while playing) and loops.
 * - run: the map's "Play buses & trains" control. From the time it was pressed, the
 *   clock runs on through the day at a few minutes a second (not looping the hour),
 *   so vehicles visibly travel their routes.
 */
import { isHoliday } from './holidays'
import type { DayType } from '../types/transport'

export type ClockMode = 'live' | 'preview' | 'run'

/** Saudi Arabia (Asia/Riyadh) is UTC+3 all year. */
const JST_MS = 3 * 3600000

// Real time until the vehicle layer sets it (it loads after the timeline shows the clock).
let mode: ClockMode = 'live'
let hourMin = 0
let rate = 1
let iso = ''
let anchor = performance.now()

/** JST date (YYYY-MM-DD) and minutes after midnight of a moment. */
function jst(ms: number): { iso: string; min: number } {
  const d = new Date(ms + JST_MS)
  return { iso: d.toISOString().slice(0, 10), min: (ms + JST_MS) % 86400000 / 60000 }
}

export const vehicleClock = {
  /** Live clock, a preview of the hour starting at `hourStartMin` on `dateIso`, or a run from that minute, at `minPerSec` simulated minutes a second. */
  set(next: ClockMode, dateIso: string, hourStartMin: number, minPerSec: number) {
    if (next !== mode || hourStartMin !== hourMin || dateIso !== iso) anchor = performance.now()
    mode = next
    iso = dateIso
    hourMin = hourStartMin
    rate = minPerSec
  },
  mode: (): ClockMode => mode,
  /** Minutes after midnight (fractional) on the clock's date. */
  minute(): number {
    if (mode === 'live') return jst(Date.now()).min
    const elapsed = ((performance.now() - anchor) / 1000) * rate
    if (mode === 'run') return (hourMin + elapsed) % 1440
    return hourMin + (elapsed % 60)
  },
  /** The clock's JST date. */
  date: (): string => (mode === 'live' ? jst(Date.now()).iso : iso),
}

/**
 * Timetable day for a Riyadh date (YYYY-MM-DD). The Saudi weekend is Friday and Saturday:
 * Friday (Jumu'ah) and public holidays run the holiday timetable ('sunday' in the shared
 * type), Saturday its own, Sunday to Thursday the weekday one.
 */
export function dayTypeOf(isoDate: string): DayType {
  const dow = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  if (dow === 5 || isHoliday(isoDate)) return 'sunday'
  return dow === 6 ? 'saturday' : 'weekday'
}

/** "HH:MM" for minutes after midnight (past 24:00 for after-midnight trips). */
export function clock(min: number): string {
  const m = Math.floor(min)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
