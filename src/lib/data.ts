import { useEffect, useState } from 'react'
import type {
  ContextFile,
  IsochronesFile,
  PoisFile,
  PrayerFile,
  RoadsFile,
  SitesFile,
  SpendFile,
  TelecomFile,
  TransportFile,
} from '../types/data'

/** Every file the app reads. Only sites and telecom are required; the rest degrade to "pending". */
export interface AppData {
  sites: SitesFile | null
  telecom: TelecomFile | null
  transport: TransportFile | null
  pois: PoisFile | null
  isochrones: IsochronesFile | null
  roads: RoadsFile | null
  spend: SpendFile | null
  context: ContextFile | null
  prayers: PrayerFile | null
  loading: boolean
  error: string | null
}

const FILES = ['sites', 'telecom_demo', 'transport', 'pois', 'isochrones', 'roads', 'spend', 'context', 'prayer_times'] as const

async function load<T>(name: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`./data/${name}.json`, { signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return null
  }
}

export function useAppData(): AppData {
  const [state, setState] = useState<AppData>({
    sites: null,
    telecom: null,
    transport: null,
    pois: null,
    isochrones: null,
    roads: null,
    spend: null,
    context: null,
    prayers: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const ctl = new AbortController()
    Promise.all(FILES.map((f) => load<unknown>(f, ctl.signal)))
      .then(([sites, telecom, transport, pois, isochrones, roads, spend, context, prayers]) => {
        setState({
          sites: sites as SitesFile | null,
          telecom: telecom as TelecomFile | null,
          transport: transport as TransportFile | null,
          pois: pois as PoisFile | null,
          isochrones: isochrones as IsochronesFile | null,
          roads: roads as RoadsFile | null,
          spend: spend as SpendFile | null,
          context: context as ContextFile | null,
          prayers: prayers as PrayerFile | null,
          loading: false,
          error: !sites || !telecom ? 'sites.json or telecom_demo.json could not be loaded' : null,
        })
      })
      .catch(() => {
        /* aborted on unmount */
      })
    return () => ctl.abort()
  }, [])

  return state
}

/** Prayer times for a date: the Umm al-Qura calendar when present, else the demo file's own day row. */
export function prayersFor(data: AppData, date: string): Record<string, string> | null {
  return data.prayers?.days[date] ?? data.telecom?.days.find((d) => d.date === date)?.prayers ?? null
}

export const PRAYERS = [
  { id: 'fajr', en: 'Fajr', ar: 'الفجر' },
  { id: 'dhuhr', en: 'Dhuhr', ar: 'الظهر' },
  { id: 'asr', en: 'Asr', ar: 'العصر' },
  { id: 'maghrib', en: 'Maghrib', ar: 'المغرب' },
  { id: 'isha', en: 'Isha', ar: 'العشاء' },
] as const

export function hhmmToHours(s: string): number {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10))
  return h + (m || 0) / 60
}
