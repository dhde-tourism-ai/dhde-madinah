import { useLang } from '../../../lib/i18n'
import { compass, sunAt } from '../../../lib/sun'

/** Where the sun is for the timeline hour: a small compass with the sun on its ring, height and direction. */
export function SunChip({ date, hour }: { date: string; hour: number }) {
  const { t } = useLang()
  const sun = sunAt(date, hour + 0.5)
  const up = sun.elevation > 1
  const [en, ar] = compass(sun.azimuth)
  const a = (sun.azimuth * Math.PI) / 180
  const r = 15
  return (
    <div className={`sun-chip ${up ? '' : 'night'}`} role="status">
      <svg viewBox="-22 -22 44 44" width="44" height="44" aria-hidden="true">
        <circle r="19" fill="none" stroke="rgba(255,255,255,.25)" />
        <text y="-11" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,.6)">N</text>
        {up ? <circle cx={Math.sin(a) * r} cy={-Math.cos(a) * r} r="5" fill="#ffc94a" stroke="#fff3c4" /> : <path d="M3 -6a6 6 0 1 0 4 10 5 5 0 0 1 -4 -10z" fill="#c9d4ff" />}
        {up && <line x1="0" y1="0" x2={-Math.sin(a) * 9} y2={Math.cos(a) * 9} stroke="#16245c" strokeWidth="3" strokeLinecap="round" />}
      </svg>
      <div>
        <b>{up ? t(`Sun ${Math.round(sun.elevation)}° high`, `الشمس بارتفاع ${Math.round(sun.elevation)}°`) : t('Night', 'ليل')}</b>
        <span>{up ? t(`from the ${en}; shadows point ${compass((sun.azimuth + 180) % 360)[0]}`, `من ${ar}`) : t('Sun below the horizon: no shadows. Press play or pick a daytime hour.', 'الشمس تحت الأفق: لا ظلال. اضغط تشغيل أو اختر ساعة نهارية.')}</span>
      </div>
    </div>
  )
}
