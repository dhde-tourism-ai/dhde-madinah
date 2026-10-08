/**
 * Pilot locations beyond Madinah (AlUla, the Red Sea, Jeddah, Makkah): their key places
 * on the map, a label per location when zoomed out, and the switcher that flies between
 * them. Madinah carries the full dashboard; the others are candidates with no data yet.
 */
import { useEffect } from 'react'
import L from 'leaflet'
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { useState } from 'react'
import { useLang } from '../../../lib/i18n'

export interface Region {
  id: string
  name: string
  name_ar: string
  center: [number, number]
  zoom: number
  arrival: string
  arrival_ar: string
  use_case: string
  use_case_ar: string
  status: 'live' | 'candidate'
  places: { name: string; name_ar: string; lat: number; lon: number; kind: string; approx: boolean }[]
}

export const KINGDOM = { center: [23.6, 41.5] as [number, number], zoom: 6 }

const KIND_ICON: Record<string, string> = { heritage: '🏛️', nature: '🪨', venue: '🎭', airport: '✈️', resort: '🏝️', leisure: '🌊', rail: '🚄', mosque: '🕋' }

/** Fly the map to a location (or the whole Kingdom) when the switcher changes. */
export function FlyRegion({ target }: { target: { center: [number, number]; zoom: number; key: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo(target.center, target.zoom, { duration: 1.6 })
  }, [map, target])
  return null
}

export function RegionLayer({ regions, onPick }: { regions: Region[]; onPick: (id: string) => void }) {
  const { t } = useLang()
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  return (
    <>
      {regions.map((r) =>
        // zoomed out: one badge per location; zoomed in: the candidate locations' key places
        zoom < 9.5 ? (
          <Marker
            key={r.id}
            position={r.center}
            zIndexOffset={900}
            icon={L.divIcon({
              className: 'region-icon',
              html: `<div class="region-badge ${r.status} r-${r.id}"><b>${t(r.name, r.name_ar)}</b><span>${r.status === 'live' ? t('Live dashboard', 'لوحة مباشرة') : t('Pilot candidate', 'موقع تجريبي مرشح')}</span></div>`,
              iconSize: [0, 0],
            })}
            eventHandlers={{ click: () => onPick(r.id) }}
          >
            <Tooltip direction="top" offset={[0, -24]} className="map-tip wide">
              <strong>{t(r.name, r.name_ar)}</strong>
              <div className="tip-row">{t(r.use_case, r.use_case_ar)}</div>
              <div className="tip-sub">{t(`Arrivals: ${r.arrival}`, `الوصول: ${r.arrival_ar}`)}</div>
            </Tooltip>
          </Marker>
        ) : (
          r.status === 'candidate' &&
          r.places.map((p) => (
            <Marker
              key={`${r.id}-${p.name}`}
              position={[p.lat, p.lon]}
              icon={L.divIcon({ className: 'origin-icon', html: `<div class="morigin-badge place">${KIND_ICON[p.kind] ?? '📍'}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] })}
            >
              <Tooltip permanent direction="right" offset={[16, 0]} className="morigin-label">
                {t(p.name, p.name_ar)}
                {p.approx ? ' ~' : ''}
              </Tooltip>
            </Marker>
          ))
        ),
      )}
    </>
  )
}

/** Right-panel card for a candidate location: the use case, how visitors arrive, what data it needs. */
export function RegionCard({ region, onBack }: { region: Region; onBack: () => void }) {
  const { t } = useLang()
  const air = /air/i.test(region.arrival) && !/railway/i.test(region.arrival)
  const needs = air
    ? [
        ['Flight arrivals by day and origin (airport / GACA)', 'أعداد الرحلات الواصلة يوميًا ومنشؤها (المطار / الهيئة العامة للطيران المدني)'],
        ['Telecom visitor counts and dwell at each place (STC)', 'أعداد الزوار ومدة بقائهم في كل موقع (STC)'],
        ['Bookings and occupancy (hotels, resorts, tour operators)', 'الحجوزات ونسب الإشغال (فنادق ومنتجعات ومشغلون)'],
      ]
    : [
        ['Haramain ridership by station and hour (SAR)', 'ركاب قطار الحرمين حسب المحطة والساعة (الخطوط الحديدية السعودية)'],
        ['Promotions and fares calendar, to test their effect', 'تقويم العروض والأسعار لاختبار أثرها'],
        ['Telecom origin–destination flows between cities (STC)', 'تدفقات التنقل بين المدن من بيانات الاتصالات (STC)'],
      ]
  return (
    <section className="float-panel region-card" aria-label={t(region.name, region.name_ar)}>
      <header className="region-card-head">
        <div>
          <div className="eyebrow">{t('Pilot candidate', 'موقع تجريبي مرشح')}</div>
          <h2 className="display region-title">{t(region.name, region.name_ar)}</h2>
        </div>
        <button className="btn btn-ghost small" onClick={onBack}>
          {t('Back to Madinah', 'العودة للمدينة')}
        </button>
      </header>
      <p className="region-use">{t(region.use_case, region.use_case_ar)}</p>
      <p className="muted small">{t(`Arrivals: ${region.arrival}`, `الوصول: ${region.arrival_ar}`)}</p>
      <div className="eyebrow">{t('Key places', 'الأماكن الرئيسية')}</div>
      <ul className="region-places">
        {region.places.map((p) => (
          <li key={p.name}>
            {KIND_ICON[p.kind] ?? '📍'} {t(p.name, p.name_ar)}
            {p.approx && <span className="muted"> · {t('position approximate', 'الموقع تقريبي')}</span>}
          </li>
        ))}
      </ul>
      <div className="eyebrow">{t('Data a pilot here would need', 'البيانات اللازمة للتجربة هنا')}</div>
      <ul className="region-needs">
        {needs.map(([en, ar]) => (
          <li key={en}>{t(en, ar)}</li>
        ))}
      </ul>
      <p className="muted small">{t('No visitor data connected yet. The Madinah dashboard is the template: the same layers switch on here once data is shared.', 'لا توجد بيانات زوار مرتبطة بعد. لوحة المدينة هي النموذج: تعمل الطبقات نفسها هنا عند مشاركة البيانات.')}</p>
    </section>
  )
}

/** Adds .map-far to the map when zoomed out to the Kingdom, so Madinah's site detail steps aside for the location badges. */
export function ZoomClass() {
  const map = useMap()
  useMapEvents({
    zoomend: () => map.getContainer().classList.toggle('map-far', map.getZoom() < 9.5),
  })
  useEffect(() => {
    map.getContainer().classList.toggle('map-far', map.getZoom() < 9.5)
  }, [map])
  return null
}

/**
 * Comparing where a first pilot could start (STA call, 4 Oct 2026): each option's use case,
 * how visitors arrive, what the dashboard already has for it, and what is still needed,
 * against STA's KPIs (visits, spending, frequency, length of stay).
 */
const OPTIONS: { ids: string[]; en: string; ar: string; use: [string, string]; have: [string, string]; need: [string, string]; ready: number }[] = [
  {
    ids: ['madinah'],
    en: 'Madinah',
    ar: 'المدينة المنورة',
    use: ['Replicate the dashboard with MDA; correlate visits, dwell and spend', 'تكرار اللوحة مع الهيئة؛ ربط الزيارات ومدة البقاء والإنفاق'],
    have: ['Live dashboard: sites, buses, Haramain timetable, prayer times, weather, real city card spend; visitor layers in demo', 'لوحة مباشرة: المواقع والحافلات وجدول قطار الحرمين وأوقات الصلاة والطقس والإنفاق الحقيقي؛ طبقات الزوار تجريبية'],
    need: ['MDA site data; STC visitor counts and dwell', 'بيانات المواقع من الهيئة؛ أعداد الزوار ومدة البقاء من STC'],
    ready: 3,
  },
  {
    ids: ['alula', 'redsea'],
    en: 'AlUla and the Red Sea',
    ar: 'العلا والبحر الأحمر',
    use: ['Test nudging: visitors arrive by air, so demand is known days ahead', 'اختبار التوجيه: الزوار يصلون جوًا فيُعرف الطلب قبل أيام'],
    have: ['Key places mapped; the same layers switch on with data', 'الأماكن الرئيسية على الخريطة؛ وتعمل الطبقات نفسها عند توفر البيانات'],
    need: ['Flight arrivals by day; bookings and occupancy; telecom counts', 'الرحلات الواصلة يوميًا؛ الحجوزات والإشغال؛ أعداد الاتصالات'],
    ready: 1,
  },
  {
    ids: ['jeddah', 'makkah'],
    en: 'Jeddah and Makkah',
    ar: 'جدة ومكة',
    use: ['Measure how trains and promotions change travel', 'قياس أثر القطارات والعروض على التنقل'],
    have: ['Official Haramain timetable already in the dashboard; stations mapped', 'جدول قطار الحرمين الرسمي موجود في اللوحة؛ والمحطات على الخريطة'],
    need: ['Haramain ridership by station and hour; promotions calendar; intercity flows', 'ركاب القطار حسب المحطة والساعة؛ تقويم العروض؛ التنقل بين المدن'],
    ready: 2,
  },
]

export function KingdomCard({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useLang()
  return (
    <section className="float-panel region-card" aria-label={t('Where a pilot could start', 'أين يمكن أن تبدأ التجربة')}>
      <div className="eyebrow">{t('Where a pilot could start', 'أين يمكن أن تبدأ التجربة')}</div>
      <h2 className="display region-title">{t('Three options, one dashboard', 'ثلاثة خيارات ولوحة واحدة')}</h2>
      <p className="muted small">{t('From the STA call (4 Oct 2026). Measured against STA’s KPIs: visits, spending, frequency and length of stay.', 'من اجتماع هيئة السياحة (٤ أكتوبر ٢٠٢٦). وفق مؤشرات الهيئة: الزيارات والإنفاق والتكرار ومدة الإقامة.')}</p>
      {OPTIONS.map((o) => (
        <div key={o.en} className="option">
          <div className="option-head">
            <b>{t(o.en, o.ar)}</b>
            <span className="ready" title={t('How much of this the dashboard already has', 'مدى جاهزية اللوحة لهذا الخيار')}>
              {'●'.repeat(o.ready)}
              {'○'.repeat(3 - o.ready)}
            </span>
          </div>
          <p className="option-use">{t(o.use[0], o.use[1])}</p>
          <p className="small">
            <span className="good-text">{t('Have', 'متوفر')}:</span> {t(o.have[0], o.have[1])}
          </p>
          <p className="small">
            <span className="warn-text">{t('Need', 'مطلوب')}:</span> {t(o.need[0], o.need[1])}
          </p>
          <div className="option-go">
            {o.ids.map((id) => (
              <button key={id} className="btn btn-ghost small" onClick={() => onPick(id)}>
                {t('Go to', 'انتقل إلى')} {id === 'redsea' ? t('Red Sea', 'البحر الأحمر') : id === 'alula' ? t('AlUla', 'العلا') : id === 'jeddah' ? t('Jeddah', 'جدة') : id === 'makkah' ? t('Makkah', 'مكة') : t('Madinah', 'المدينة')}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="muted small">{t('Open question for STA and the Ministry: which first use case to back. Clear use cases are what convince decision-makers.', 'سؤال مفتوح لهيئة السياحة والوزارة: أي حالة استخدام تُدعم أولًا. فحالات الاستخدام الواضحة هي ما يقنع صناع القرار.')}</p>
    </section>
  )
}
