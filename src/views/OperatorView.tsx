import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import type { AppData } from '../lib/data'
import { useLang } from '../lib/i18n'
import { fmtNum } from '../lib/format'
import { clusterOf } from '../lib/sites'
import { Card, DemoBadge, Icon, Kpi, Prov, Seg } from '../components/ui'
import {
  allBookings,
  buildRoute,
  capacityFor,
  createBooking,
  ITINERARIES,
  legBetween,
  makeCtx,
  operatorStore,
  ORIGIN_ICON,
  PAX_PER_COACH,
  PHASE_LABEL,
  phaseOf,
  siteLoad,
  sitesFor,
  SLOTS,
  toMin,
  unsafeSite,
  useOperatorState,
  valueUnsafe,
  verifyUrl,
  remainingFor,
} from '../lib/operator'
import type { Booking, Leg, OperatorCtx, Weather } from '../lib/operator'

function riyadhNow() {
  const d = new Date(Date.now() + 3 * 3600000)
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

export function useOperatorCtx(data: AppData): OperatorCtx | null {
  const [legs, setLegs] = useState<Record<string, Leg> | null>(null)
  useEffect(() => {
    fetch('./data/coach_legs.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setLegs(j?.legs ?? {}))
      .catch(() => setLegs({}))
  }, [])
  return useMemo(() => (data.sites && legs ? makeCtx(data.sites, legs) : null), [data.sites, legs])
}

export function QR({ text, size = 132 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(text)
    q.make()
    const n = q.getModuleCount()
    return q.createSvgTag({ cellSize: Math.max(2, Math.floor(size / (n + 8))), margin: 4, scalable: true })
  }, [text, size])
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}

const WEATHER: { id: Weather; en: string; ar: string; icon: string; den: string; dar: string }[] = [
  { id: 'clear', en: 'Clear', ar: 'صافٍ', icon: '☀️', den: 'No weather impact on any site.', dar: 'لا أثر للطقس على أي موقع.' },
  { id: 'heat', en: 'Extreme heat', ar: 'حرارة شديدة', icon: '🌡️', den: 'Most exposed sites (Jabal Ayr, Uhud summit) on hold; others open with shade advice.', dar: 'أكثر المواقع تعرضًا (جبل عير وقمة أحد) معلّقة؛ والبقية مفتوحة مع نصائح الظل.' },
  { id: 'rain', en: 'Rain', ar: 'ممطر', icon: '🌧️', den: 'Light impact on exposed sites. Bookings stay open.', dar: 'أثر خفيف على المواقع المكشوفة. الحجوزات مفتوحة.' },
  { id: 'storm', en: 'Storm advisory', ar: 'تحذير عاصفة', icon: '⛈️', den: 'Exposed sites on hold for new reservations until it clears.', dar: 'المواقع المكشوفة معلّقة للحجوزات الجديدة حتى يصفو الجو.' },
]

function satisfaction(base: number, load: number, cap: number, exposure: number, w: Weather) {
  const ratio = cap ? load / cap : 0
  const crowd = ratio > 0.85 ? (ratio - 0.85) * 80 : 0
  const wx = w === 'storm' ? exposure * 30 : w === 'heat' ? exposure * 22 : w === 'rain' ? exposure * 12 : 0
  return Math.max(30, Math.min(99, Math.round(base - crowd - wx)))
}

export default function OperatorView({ data }: { data: AppData }) {
  const { t, lang } = useLang()
  const ctx = useOperatorCtx(data)
  const st = useOperatorState()
  const now = riyadhNow()
  const [date, setDate] = useState(now.date)
  const dates = useMemo(() => {
    const out: string[] = []
    for (let i = -1; i < 7; i++) out.push(new Date(Date.parse(now.date + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10))
    return out
  }, [now.date])
  const bookings = useMemo(() => allBookings(ctx, st, dates), [ctx, st, dates])
  const dayBookings = bookings.filter((b) => b.date === date)

  // form
  const [operator, setOperator] = useState('')
  const [groupSize, setGroupSize] = useState(80)
  const [coaches, setCoaches] = useState(2)
  const [origin, setOrigin] = useState('haram')
  const [value, setValue] = useState('route:A')
  const [slot, setSlot] = useState<string | null>(null)
  const [guide, setGuide] = useState(true)
  const [made, setMade] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showQr, setShowQr] = useState<Booking | null>(null)

  if (!ctx) return <div className="state-msg">{t('Loading operator data…', 'جارٍ تحميل بيانات المشغل…')}</div>

  const siteName = (id: string) => (ctx.byId[id] ? t(ctx.byId[id].name, ctx.byId[id].name_ar) : id)
  const valueLabel = (v: string) => {
    const it = ITINERARIES.find((x) => x.value === v)
    return it ? t(it.en, it.ar) : siteName(v.replace('site:', ''))
  }
  const originLabel = (id: string) => {
    const o = ctx.origins.find((x) => x.id === id)
    return o ? `${ORIGIN_ICON[o.id] ?? '📍'} ${t(o.label, o.label_ar)}` : id
  }
  const cap = capacityFor(ctx, value)
  const unsafe = valueUnsafe(ctx, value, st.weather)
  const preview = buildRoute(ctx, origin, sitesFor(ctx, value))
  const driveMin = preview.order.reduce((a, id, i) => a + legBetween(ctx, i ? preview.order[i - 1] : origin, id).min, 0)
  const visitMin = preview.order.reduce((a, id) => a + (ctx.byId[id]?.typical_visit_min ?? 30), 0)
  const isToday = date === now.date

  const submit = () => {
    setError(null)
    if (!operator.trim()) return setError(t('Enter the operator or company name.', 'أدخل اسم المشغل أو الشركة.'))
    if (!slot) return setError(t('Pick a time slot first.', 'اختر فترة زمنية أولًا.'))
    const res = createBooking(ctx, bookings, { operator: operator.trim(), value, date, slot, origin, coaches, groupSize, guide }, st.weather, false, isToday ? now.min : -1)
    if (!res.length) return setError(t('No capacity left at this site or its cluster today. Try another date.', 'لا توجد سعة متبقية في هذا الموقع أو مجموعته اليوم. جرّب تاريخًا آخر.'))
    operatorStore.add(res)
    setMade(res)
    setSlot(null)
  }

  const counts = { upcoming: 0, 'in-progress': 0, ready: 0, completed: 0 }
  dayBookings.forEach((b) => (counts[phaseOf(b, now.date, now.min)] += b.coaches))
  const totalCoaches = dayBookings.reduce((a, b) => a + b.coaches, 0)
  const totalPax = dayBookings.reduce((a, b) => a + b.groupSize, 0)
  const wx = WEATHER.find((w) => w.id === st.weather)!

  return (
    <div className="page operator-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{t('Operator view · tour coaches', 'عرض المشغل · حافلات الرحلات')}</div>
          <h1 className="display page-title">{t('Book group visits, spread coaches across sites and slots, sign them off', 'احجز الزيارات الجماعية، ووزّع الحافلات على المواقع والفترات، ووقّع إنجازها')}</h1>
          <p className="page-lede">
            {t(
              'Built for tour operators: groups arrive 40+ at a time, by coach. Capacity is counted in coaches per site per hour; a full slot spills to the nearest slot or a sibling site in the same cluster. MRDA oversees every operator from the same data on the Oversight map.',
              'مصمم لمشغلي الرحلات: تصل المجموعات ٤٠ شخصًا فأكثر بالحافلات. تُحسب السعة بعدد الحافلات لكل موقع في الساعة؛ والفترة الممتلئة تنتقل إلى أقرب فترة أو موقع شقيق في المجموعة نفسها. وتشرف الهيئة على جميع المشغلين من البيانات نفسها على خريطة الإشراف.',
            )}
          </p>
        </div>
        <div className="page-head-right">
          <DemoBadge />
          <Seg
            label={t('Mode', 'الوضع')}
            value={st.mode}
            onChange={(m) => operatorStore.setMode(m)}
            options={[
              { id: 'demo', label: t('Demo day', 'يوم تجريبي') },
              { id: 'manual', label: t('My bookings only', 'حجوزاتي فقط') },
            ]}
          />
        </div>
      </header>

      <div className="kpi-row">
        <Kpi label={t('Coaches booked', 'الحافلات المحجوزة')} prov="illustrative" value={fmtNum(totalCoaches, lang)} sub={`${fmtNum(totalPax, lang)} ${t('visitors', 'زائر')}`} />
        <Kpi label={t('On visit now', 'في الزيارة الآن')} prov="illustrative" value={fmtNum(isToday ? counts['in-progress'] : 0, lang)} sub={t('coaches on the road or at a site', 'حافلات على الطريق أو في موقع')} />
        <Kpi label={t('Awaiting sign-off', 'بانتظار التوقيع')} prov="illustrative" value={fmtNum(counts.ready, lang)} />
        <Kpi label={t('Weather', 'الطقس')} prov="modelled" value={`${wx.icon} ${t(wx.en, wx.ar)}`} sub={t(wx.den, wx.dar)} />
      </div>

      <div className="grid-2">
        <Card title={t('Book a group visit', 'حجز زيارة جماعية')} sub={t('Confirmation with a scannable QR code', 'تأكيد مع رمز QR قابل للمسح')} prov="illustrative">
          <div className="form-grid">
            <label>
              <span>{t('Operator / company name', 'اسم المشغل / الشركة')}</span>
              <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Al-Noor Tours" />
            </label>
            <label>
              <span>{t('Group size', 'حجم المجموعة')}</span>
              <input
                type="number"
                min={1}
                value={groupSize}
                onChange={(e) => {
                  const n = Math.max(1, +e.target.value)
                  setGroupSize(n)
                  setCoaches(Math.max(1, Math.ceil(n / PAX_PER_COACH)))
                }}
              />
            </label>
            <label>
              <span>{t('Coaches', 'عدد الحافلات')}</span>
              <input type="number" min={1} max={12} value={coaches} onChange={(e) => setCoaches(Math.max(1, Math.min(12, +e.target.value)))} />
            </label>
            <label>
              <span>{t('Starting point', 'نقطة الانطلاق')}</span>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                {ctx.origins.map((o) => (
                  <option key={o.id} value={o.id}>
                    {originLabel(o.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              <span>{t('Site or itinerary', 'الموقع أو المسار')}</span>
              <select value={value} onChange={(e) => { setValue(e.target.value); setSlot(null) }}>
                <optgroup label={t('Suggested itineraries', 'المسارات المقترحة')}>
                  {ITINERARIES.map((it) => (
                    <option key={it.value} value={it.value}>
                      {t(it.en, it.ar)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('Individual sites', 'مواقع منفردة')}>
                  {ctx.sites.map((s) => (
                    <option key={s.id} value={`site:${s.id}`}>
                      {s.num}. {t(s.name, s.name_ar)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              <span>{t('Visit date', 'تاريخ الزيارة')}</span>
              <input type="date" value={date} min={now.date} onChange={(e) => { setDate(e.target.value); setSlot(null) }} />
            </label>
            <label className="check">
              <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
              <span>{t('Request a licensed guide', 'طلب مرشد مرخص')}</span>
            </label>
          </div>

          <div className="route-preview">
            {t('Suggested order', 'الترتيب المقترح')}: <b>{preview.order.map((id) => ctx.byId[id]?.num).join(' → ')}</b> · {fmtNum(preview.km, lang, 1)} {t('km', 'كم')} · ~
            {Math.round(driveMin)} {t('min driving', 'د قيادة')} + ~{visitMin} {t('min visiting', 'د زيارة')}
            <span className="muted"> · {t('capacity', 'السعة')} ~{cap} {t('coaches / slot', 'حافلة / فترة')}</span>
          </div>

          <div className="slot-grid" role="group" aria-label={t('Time slot', 'الفترة الزمنية')}>
            {SLOTS.map((s) => {
              const past = isToday && toMin(s) <= now.min
              const left = Math.max(0, remainingFor(ctx, bookings, value, date, s))
              const full = left <= 0
              const disabled = past || full || unsafe
              return (
                <button key={s} className={`slot ${slot === s ? 'sel' : ''} ${full ? 'full' : ''} ${past ? 'past' : ''} ${unsafe ? 'hold' : ''}`} disabled={disabled} onClick={() => setSlot(s)}>
                  <b>{s}</b>
                  <span>{unsafe ? t('On hold', 'معلّق') : past ? t('Passed', 'انتهى') : full ? t('Full', 'ممتلئ') : `${left} ${t('left', 'متبقٍ')}`}</span>
                </button>
              )
            })}
          </div>
          {unsafe && <p className="callout warn">{t(`${wx.icon} ${wx.en}: this site or itinerary is on hold for new reservations. Choose another, or change the weather above when it clears.`, `${wx.icon} ${wx.ar}: هذا الموقع أو المسار معلّق للحجوزات الجديدة.`)}</p>}
          {error && <p className="callout warn">{error}</p>}
          <button className="btn btn-accent book-btn" onClick={submit}>
            {t('Request reservation', 'طلب الحجز')}
          </button>

          {made && made.length > 0 && (
            <div className="confirm">
              <QR text={verifyUrl(made[0])} />
              <div>
                <div className="eyebrow">{t('Reservation confirmed', 'تم تأكيد الحجز')}</div>
                <div className="code mono">{made[0].groupCode}</div>
                {made.map((b) => (
                  <p key={b.code} className="small">
                    {b.code}: {valueLabel(b.value)} · {b.slot} · {b.coaches} {t('coach(es)', 'حافلة')} · {t('leave', 'المغادرة')} {Math.floor(b.start / 60)}:{String(Math.round(b.start % 60)).padStart(2, '0')}
                  </p>
                ))}
                {made.length > 1 && <p className="small muted">{t('The group was split to fit capacity: the nearest open slots or sibling sites were used.', 'قُسّمت المجموعة لتناسب السعة: استُخدمت أقرب الفترات أو المواقع الشقيقة.')}</p>}
                <p className="small muted">{t('Show this code at the site. Scanning it opens the booking check.', 'اعرض هذا الرمز في الموقع. مسحه يفتح التحقق من الحجز.')}</p>
              </div>
            </div>
          )}
        </Card>

        <Card title={t('Capacity per site', 'السعة لكل موقع')} sub={t('Coaches booked per hourly slot, for the chosen date', 'الحافلات المحجوزة لكل فترة، للتاريخ المختار')} prov="illustrative">
          <div className="wx-row">
            {WEATHER.map((w) => (
              <button key={w.id} className="btn btn-ghost" aria-pressed={st.weather === w.id} onClick={() => operatorStore.setWeather(w.id)}>
                {w.icon} {t(w.en, w.ar)}
              </button>
            ))}
          </div>
          <div className="cap-list">
            {ctx.sites.map((s) => {
              const c = s.capacity_per_slot ?? 0
              const loads = SLOTS.map((sl) => siteLoad(ctx, bookings, s.id, date, sl))
              const peak = Math.max(...loads)
              const hold = unsafeSite(s, st.weather)
              const sat = satisfaction(s.satisfaction_base, peak, c, s.exposure, st.weather)
              return (
                <div key={s.id} className={`cap-row ${hold ? 'hold' : ''}`}>
                  <div className="cap-name">
                    <span className="num-badge" style={{ background: clusterOf(s).colour }}>
                      {s.num}
                    </span>
                    <span>{t(s.short, s.short_ar)}</span>
                  </div>
                  <div className="cap-bars" aria-label={t('Coaches per slot', 'الحافلات لكل فترة')}>
                    {loads.map((l, i) => {
                      const r = c ? l / c : 0
                      return <span key={i} title={`${SLOTS[i]} · ${l}/${c}`} className={`cap-bar ${r >= 1 ? 'full' : r >= 0.7 ? 'busy' : l ? 'some' : ''}`} style={{ height: `${Math.max(8, Math.min(1, r) * 100)}%` }}></span>
                    })}
                  </div>
                  <div className="cap-meta">
                    <span className="tnum">
                      {peak}/{c}
                    </span>
                    <span className={`sat ${sat >= 80 ? '' : sat >= 60 ? 'warm' : 'hot'}`} title={t('Illustrative satisfaction: drops with crowding and weather', 'رضا توضيحي: ينخفض مع الازدحام والطقس')}>
                      😊 {sat}%
                    </span>
                    {hold && <span className="hold-tag">{t('On hold', 'معلّق')}</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="muted small">
            {SLOTS[0]}–{SLOTS[SLOTS.length - 1]} · {t('Bars: green some, amber 70%+, red full. Capacities are illustrative until MRDA publishes site limits.', 'الأشرطة: أخضر بعض الحجوزات، كهرماني ٧٠٪+، أحمر ممتلئ. السعات توضيحية حتى تنشر الهيئة حدود المواقع.')}
          </p>
        </Card>

        <Card
          title={t('Operator console', 'لوحة المشغل')}
          sub={t('Every reservation for the date, with live status. Sign off a coach when its group is back.', 'كل حجوزات التاريخ مع حالتها المباشرة. وقّع الحافلة عند عودة مجموعتها.')}
          prov="illustrative"
          className="span-2"
          right={
            <div className="day-pick">
              {dates.slice(1).map((d) => (
                <button key={d} className="btn btn-ghost" aria-pressed={d === date} onClick={() => setDate(d)}>
                  {new Date(d + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric' })}
                </button>
              ))}
            </div>
          }
        >
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('Code', 'الرمز')}</th>
                  <th>{t('Operator', 'المشغل')}</th>
                  <th>{t('Site or itinerary', 'الموقع أو المسار')}</th>
                  <th>{t('From', 'من')}</th>
                  <th>{t('Slot', 'الفترة')}</th>
                  <th className="num-cell">{t('Group', 'المجموعة')}</th>
                  <th className="num-cell">{t('Coaches', 'حافلات')}</th>
                  <th>{t('Guide', 'مرشد')}</th>
                  <th>{t('Status', 'الحالة')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dayBookings.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted">
                      {t('No reservations for this date.', 'لا توجد حجوزات لهذا التاريخ.')}
                    </td>
                  </tr>
                )}
                {[...dayBookings]
                  .sort((a, b) => a.start - b.start)
                  .map((b) => {
                    const ph = phaseOf(b, now.date, now.min)
                    return (
                      <tr key={b.code}>
                        <td className="mono small">{b.code}</td>
                        <td>
                          {b.operator}
                          {b.demo && <span className="muted small"> · {t('demo', 'تجريبي')}</span>}
                        </td>
                        <td>{valueLabel(b.value)}</td>
                        <td className="small">{originLabel(b.origin)}</td>
                        <td className="tnum">{b.slot}</td>
                        <td className="num-cell tnum">{b.groupSize}</td>
                        <td className="num-cell tnum">{b.coaches}</td>
                        <td>{b.guide ? t('Yes', 'نعم') : t('No', 'لا')}</td>
                        <td>
                          <span className={`phase phase-${ph}`}>{t(PHASE_LABEL[ph][0], PHASE_LABEL[ph][1])}</span>
                        </td>
                        <td className="row-actions">
                          <button className="icon-btn" title={t('Show QR', 'عرض الرمز')} onClick={() => setShowQr(b)}>
                            <Icon name="survey" size={15} />
                          </button>
                          <button className="btn btn-ghost small" disabled={ph !== 'ready'} onClick={() => operatorStore.signOff(b.code)}>
                            {t('Sign off', 'توقيع')}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <div className="console-foot">
            <a className="btn btn-ghost" href="#/map">
              <Icon name="map" size={15} /> {t('Watch the coaches on the Oversight map', 'تابع الحافلات على خريطة الإشراف')}
            </a>
            {st.mine.length > 0 && (
              <button className="btn btn-ghost" onClick={() => operatorStore.clear()}>
                {t('Clear my bookings', 'مسح حجوزاتي')}
              </button>
            )}
            <span className="muted small">
              <Prov kind="illustrative" /> {t('Bookings stay in this browser; nothing is sent anywhere.', 'تبقى الحجوزات في هذا المتصفح ولا تُرسل إلى أي جهة.')}
            </span>
          </div>
        </Card>
      </div>

      {showQr && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setShowQr(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn modal-close" onClick={() => setShowQr(null)} aria-label={t('Close', 'إغلاق')}>
              <Icon name="close" />
            </button>
            <QR text={verifyUrl(showQr)} size={220} />
            <div className="code mono">{showQr.code}</div>
            <p className="small">
              {showQr.operator} · {valueLabel(showQr.value)} · {showQr.date} {showQr.slot} · {showQr.coaches} {t('coach(es)', 'حافلة')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
