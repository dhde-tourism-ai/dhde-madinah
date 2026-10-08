import { useEffect, useState } from 'react'
import { useLang } from '../../../lib/i18n'

export const PRAYER_NAMES: { id: string; en: string; ar: string }[] = [
  { id: 'fajr', en: 'Fajr', ar: 'الفجر' },
  { id: 'sunrise', en: 'Sunrise', ar: 'الشروق' },
  { id: 'dhuhr', en: 'Dhuhr', ar: 'الظهر' },
  { id: 'asr', en: 'Asr', ar: 'العصر' },
  { id: 'maghrib', en: 'Maghrib', ar: 'المغرب' },
  { id: 'isha', en: 'Isha', ar: 'العشاء' },
]

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))

function riyadhNow() {
  const d = new Date(Date.now() + 3 * 3600000)
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 }
}

/**
 * Prayer times in Madinah for the timeline's day (Umm al-Qura), with the next prayer and a
 * countdown: crowds, traffic and coach slots all move with them. At Now it counts down in
 * real time; scrubbed to another hour it shows that hour's position in the day.
 */
export function PrayerCard({ date, times, hour, atNow }: { date: string; times: Record<string, string> | null; hour: number; atNow: boolean }) {
  const { t } = useLang()
  const [now, setNow] = useState(riyadhNow)
  useEffect(() => {
    if (!atNow) return
    const id = window.setInterval(() => setNow(riyadhNow()), 15000)
    return () => window.clearInterval(id)
  }, [atNow])
  if (!times) return null
  const m = atNow && now.date === date ? now.min : hour * 60 + 30
  const list = PRAYER_NAMES.filter((p) => times[p.id])
  const next = list.find((p) => p.id !== 'sunrise' && toMin(times[p.id]) > m)
  const current = [...list].reverse().find((p) => p.id !== 'sunrise' && toMin(times[p.id]) <= m && m - toMin(times[p.id]) < 25)
  const left = next ? Math.max(0, Math.round(toMin(times[next.id]) - m)) : null
  const fmtLeft = (x: number) => (x >= 60 ? `${Math.floor(x / 60)} h ${x % 60} min` : `${x} min`)

  return (
    <section className="float-panel prayer-card" aria-label={t('Prayer times', 'أوقات الصلاة')}>
      <header className="prayer-head">
        <span className="eyebrow">{t('Prayer times · Madinah', 'أوقات الصلاة · المدينة المنورة')}</span>
        {current ? (
          <span className="prayer-now">{t(`${current.en} prayer now`, `صلاة ${current.ar} الآن`)}</span>
        ) : next && left !== null ? (
          <span className="prayer-next">
            {t(next.en, next.ar)} {t('in', 'بعد')} <b>{fmtLeft(left)}</b>
          </span>
        ) : null}
      </header>
      <ol className="prayer-list">
        {list.map((p) => {
          const pm = toMin(times[p.id])
          const state = current?.id === p.id ? 'now' : next?.id === p.id ? 'next' : pm <= m ? 'past' : ''
          return (
            <li key={p.id} className={`prayer ${state} ${p.id === 'sunrise' ? 'sun' : ''}`}>
              <span className="prayer-name">{t(p.en, p.ar)}</span>
              <span className="prayer-time num">{times[p.id]}</span>
            </li>
          )
        })}
      </ol>
      <p className="prayer-src">{t('Umm al-Qura calendar. Crowds and traffic peak around each prayer.', 'تقويم أم القرى. تبلغ الحشود والحركة ذروتها حول كل صلاة.')}</p>
    </section>
  )
}
