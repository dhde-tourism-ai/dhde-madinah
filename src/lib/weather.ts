import { useEffect, useState } from 'react'

export interface DayWeather {
  temp: (number | null)[]
  feels: (number | null)[]
}

const cache = new Map<string, DayWeather | null>()

/**
 * Hourly temperature for central Madinah from Open-Meteo (free, no key): past 14 days
 * and the next 7. Returns null outside that window or offline; the map simply hides it.
 */
export function useWeather(date: string): DayWeather | null {
  // bumped when a fetch fills the cache; the value itself is read from the cache
  const [, setVersion] = useState(0)
  useEffect(() => {
    if (cache.has(date)) return
    const ctl = new AbortController()
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=24.467&longitude=39.611&hourly=temperature_2m,apparent_temperature&timezone=Asia%2FRiyadh&past_days=14&forecast_days=7'
    fetch(url, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { hourly?: { time: string[]; temperature_2m: number[]; apparent_temperature: number[] } } | null) => {
        if (!j?.hourly) return
        const byDay = new Map<string, DayWeather>()
        j.hourly.time.forEach((ts, i) => {
          const d = ts.slice(0, 10)
          const h = parseInt(ts.slice(11, 13), 10)
          if (!byDay.has(d)) byDay.set(d, { temp: Array(24).fill(null), feels: Array(24).fill(null) })
          byDay.get(d)!.temp[h] = j.hourly!.temperature_2m[i]
          byDay.get(d)!.feels[h] = j.hourly!.apparent_temperature[i]
        })
        byDay.forEach((v, k) => cache.set(k, v))
        if (!byDay.has(date)) cache.set(date, null)
        setVersion((v) => v + 1)
      })
      .catch(() => {
        /* offline or blocked: no weather chip */
      })
    return () => ctl.abort()
  }, [date])
  return cache.get(date) ?? null
}
