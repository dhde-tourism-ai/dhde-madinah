import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { AppData } from '../lib/data'
import { hhmmToHours, PRAYERS, prayersFor } from '../lib/data'
import { useLang } from '../lib/i18n'
import { fmtCompact, fmtHour, fmtNum, fmtPct, fmtSar, fmtDate } from '../lib/format'
import { clusterOf, peakPresence, presenceAt } from '../lib/sites'
import { DemoBadge, Icon, Prov } from '../components/ui'
import type { IconName } from '../lib/icons'
import type { LatLon, Provenance, Site } from '../types/data'
import { go } from '../lib/route'
import { useWeather } from '../lib/weather'

type LayerId = 'visitors' | 'flows' | 'wifi' | 'spend' | 'bus' | 'rail' | 'parking' | 'walk' | 'pois' | 'traffic'

const LAYERS: { group: { en: string; ar: string }; items: { id: LayerId; en: string; ar: string; icon: IconName; prov: Provenance }[] }[] = [
  {
    group: { en: 'Visitors (STC-style)', ar: 'الزوار (بصيغة STC)' },
    items: [
      { id: 'visitors', en: 'Visitors on site', ar: 'الزوار في الموقع', icon: 'people', prov: 'illustrative' },
      { id: 'flows', en: 'Trips between sites', ar: 'الرحلات بين المواقع', icon: 'flow', prov: 'illustrative' },
      { id: 'spend', en: 'Card spend (stc pay style)', ar: 'الإنفاق بالبطاقات', icon: 'spend', prov: 'illustrative' },
      { id: 'wifi', en: 'Wi-Fi zones (proposed)', ar: 'مناطق الواي فاي (مقترحة)', icon: 'wifi', prov: 'illustrative' },
    ],
  },
  {
    group: { en: 'Transport', ar: 'النقل' },
    items: [
      { id: 'bus', en: 'Bus stops and stations', ar: 'محطات الحافلات', icon: 'bus', prov: 'real' },
      { id: 'rail', en: 'Haramain rail and stations', ar: 'قطار الحرمين والمحطات', icon: 'train', prov: 'real' },
      { id: 'parking', en: 'Car parks', ar: 'المواقف', icon: 'parking', prov: 'real' },
      { id: 'traffic', en: 'Traffic on main roads', ar: 'الحركة على الطرق الرئيسية', icon: 'traffic', prov: 'illustrative' },
    ],
  },
  {
    group: { en: 'Around each site', ar: 'حول كل موقع' },
    items: [
      { id: 'walk', en: 'Walking reach (5/10/15 min)', ar: 'نطاق المشي (٥/١٠/١٥ دقيقة)', icon: 'walk', prov: 'modelled' },
      { id: 'pois', en: 'Food, shops, shade, services', ar: 'مطاعم ومتاجر وظل وخدمات', icon: 'shade', prov: 'real' },
    ],
  },
]

const POI_COLOUR: Record<string, string> = { food: '#d95926', shop: '#9085e9', lodging: '#3987e5', services: '#199e70', shade: '#6da7ec', mosque: '#c98500' }
const POI_LABEL: Record<string, [string, string]> = {
  food: ['Food and cafés', 'مطاعم ومقاهٍ'],
  shop: ['Shops', 'متاجر'],
  lodging: ['Hotels', 'فنادق'],
  services: ['Toilets, water, ATMs', 'دورات مياه وماء وصراف'],
  shade: ['Shade and parks', 'ظل وحدائق'],
  mosque: ['Mosques', 'مساجد'],
}

/** Illustrative congestion index 0–1 by road class and hour: commute peaks plus prayer-time surges. */
function trafficIndex(cls: string, hour: number, prayerHours: number[]): number {
  const base = cls === 'motorway' || cls === 'trunk' ? 0.32 : cls === 'primary' ? 0.4 : 0.3
  let v = base
  v += 0.25 * Math.exp(-((hour - 8) ** 2) / 3) + 0.3 * Math.exp(-((hour - 17.5) ** 2) / 4)
  for (const p of prayerHours) v += 0.22 * Math.exp(-((hour + 0.5 - (p + 0.6)) ** 2) / 0.8)
  if (hour < 5) v *= 0.4
  return Math.min(1, v)
}
const trafficColour = (v: number) => (v > 0.75 ? '#d03b3b' : v > 0.55 ? '#ec835a' : v > 0.4 ? '#fab219' : '#0ca30c')

function FlyTo({ site }: { site: Site | null }) {
  const map = useMap()
  useEffect(() => {
    if (site) map.flyTo([site.lat, site.lon], Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [site, map])
  return null
}

export default function MapView({ data, selected }: { data: AppData; selected: string | null }) {
  const { t, lang } = useLang()
  const tel = data.telecom!
  const sites = data.sites!.sites
  const siteById = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s])), [sites])
  const [day, setDay] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    return Math.max(0, tel.days.findIndex((d) => d.date === today))
  })
  const [hour, setHour] = useState(() => new Date().getHours())
  const [playing, setPlaying] = useState(false)
  const [on, setOn] = useState<Set<LayerId>>(() => new Set<LayerId>(['visitors', 'flows', 'bus', 'rail']))
  const [base, setBase] = useState<'dark' | 'imagery'>('dark')
  const [panelOpen, setPanelOpen] = useState(true)
  const sel = selected ? siteById[selected] ?? null : null
  const date = tel.days[day].date
  const prayers = prayersFor(data, date)
  const prayerHours = prayers ? PRAYERS.map((p) => hhmmToHours(prayers[p.id])) : []
  const idx = day * 24 + hour
  const weather = useWeather(date)

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setHour((h) => (h + 1) % 24), 900)
    return () => window.clearInterval(id)
  }, [playing])

  const toggle = (id: LayerId) =>
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const maxPresence = useMemo(() => Math.max(...sites.map((s) => (s.id === 'haram' ? 0 : peakPresence(tel, s.id)))), [sites, tel])
  const radius = (v: number | null, id: string) => {
    if (v == null) return 4
    const r = 6 + 34 * Math.sqrt(v / maxPresence)
    return id === 'haram' ? Math.min(r, 46) : r
  }
  const maxTrips = Math.max(...tel.od.map((o) => o.trips_day))
  // without a selected site, show only the 20 strongest links
  const flowCut = [...tel.od].sort((a, b) => b.trips_day - a.trips_day)[19]?.trips_day ?? 0
  const select = (id: string | null) => go('map', id)

  const missing = (id: LayerId) =>
    (id === 'bus' || id === 'rail' || id === 'parking') && !data.transport ? true : id === 'walk' && !data.isochrones ? true : id === 'pois' && !data.pois ? true : id === 'traffic' && !data.roads

  return (
    <div className="map-wrap">
      <MapContainer
        className="map"
        center={[24.462, 39.605]}
        zoom={13}
        minZoom={10}
        maxZoom={18}
        preferCanvas
        zoomControl={false}
        attributionControl
      >
        {base === 'dark' ? (
          <>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" attribution="Esri, HERE, Garmin, &copy; OpenStreetMap contributors" maxNativeZoom={16} />
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={16} />
          </>
        ) : (
          <>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Imagery &copy; Esri" />
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
          </>
        )}
        <FlyTo site={sel} />

        {on.has('walk') &&
          data.isochrones &&
          sites.map((s) => {
            const iso = data.isochrones!.sites[s.id]
            if (!iso || (sel && sel.id !== s.id)) return null
            return [...data.isochrones!.minutes].reverse().map((m) => {
              const ring = iso[String(m)] as LatLon[] | undefined
              if (!ring?.length) return null
              const shade = m === 5 ? 0.28 : m === 10 ? 0.18 : 0.1
              return (
                <Polygon key={`${s.id}-${m}`} positions={ring} pathOptions={{ color: '#6da7ec', weight: 1, fillColor: '#3987e5', fillOpacity: shade }}>
                  <Tooltip sticky>
                    {t(s.name, s.name_ar)} · {m} {t('min walk', 'دقيقة مشيًا')}
                  </Tooltip>
                </Polygon>
              )
            })
          })}

        {on.has('traffic') &&
          data.roads?.roads.map((r) => {
            const v = trafficIndex(r.class, hour, prayerHours)
            return (
              <Polyline key={r.id} positions={r.path} pathOptions={{ color: trafficColour(v), weight: r.class === 'secondary' ? 2.5 : 4, opacity: 0.85 }}>
                <Tooltip sticky>
                  {t(r.name || 'Road', r.name_ar || r.name)} · {t('congestion', 'الازدحام')} {fmtPct(v, lang)} ({t('illustrative', 'توضيحي')})
                </Tooltip>
              </Polyline>
            )
          })}

        {on.has('parking') &&
          data.transport?.parking.map((p) =>
            p.polygon ? (
              <Polygon key={p.id} positions={p.polygon} pathOptions={{ color: '#aeb9cd', weight: 1, fillColor: '#7f8ba3', fillOpacity: 0.35 }}>
                <Tooltip sticky>
                  {t('Car park', 'موقف')} {p.name ? `· ${p.name}` : ''} {p.capacity ? `· ${fmtNum(p.capacity, lang)} ${t('spaces', 'موقفًا')}` : ''}
                </Tooltip>
              </Polygon>
            ) : (
              <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={4} pathOptions={{ color: '#aeb9cd', weight: 1, fillColor: '#7f8ba3', fillOpacity: 0.7 }}>
                <Tooltip>{t('Car park', 'موقف')}</Tooltip>
              </CircleMarker>
            ),
          )}

        {on.has('bus') &&
          data.transport?.bus_routes.map((r) => (
            <Polyline key={r.id} positions={r.path} pathOptions={{ color: r.colour || '#3987e5', weight: 3, opacity: 0.8 }}>
              <Tooltip sticky>
                {t('Bus', 'حافلة')} {r.ref ?? ''} {r.name ? `· ${t(r.name, r.name_ar)}` : ''}
              </Tooltip>
            </Polyline>
          ))}
        {on.has('bus') &&
          data.transport?.bus_stops.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={2.5} pathOptions={{ color: '#9ec5f4', weight: 1, fillColor: '#0a1120', fillOpacity: 1 }}>
              <Tooltip>{t(s.name || 'Bus stop', s.name_ar || s.name)}</Tooltip>
            </CircleMarker>
          ))}

        {on.has('rail') &&
          data.transport?.rail.map((r) => (
            <Polyline key={r.id} positions={r.path} pathOptions={{ color: r.kind === 'high_speed' ? '#e9eef8' : '#9085e9', weight: 3.5, dashArray: r.kind === 'high_speed' ? '10 6' : '4 6' }}>
              <Tooltip sticky>{r.name || t('Rail', 'سكة حديد')}</Tooltip>
            </Polyline>
          ))}
        {on.has('rail') &&
          data.transport?.stations.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={7} pathOptions={{ color: '#e9eef8', weight: 2, fillColor: s.kind === 'rail' ? '#8b9dff' : '#3987e5', fillOpacity: 1 }}>
              <Tooltip>{t(s.name || 'Station', s.name_ar || s.name)}</Tooltip>
            </CircleMarker>
          ))}

        {on.has('pois') &&
          data.pois?.points.map((p, i) => (
            <CircleMarker key={i} center={[p.lat, p.lon]} radius={2} pathOptions={{ stroke: false, fillColor: POI_COLOUR[p.cat] ?? '#7f8ba3', fillOpacity: 0.8 }}>
              {p.name && <Tooltip>{p.name}</Tooltip>}
            </CircleMarker>
          ))}

        {on.has('flows') &&
          tel.od
            .filter((o) => (sel ? o.from === sel.id || o.to === sel.id : o.trips_day >= flowCut))
            .map((o) => {
              const a = siteById[o.from]
              const b = siteById[o.to]
              if (!a || !b) return null
              // bend each line a little so A→B and B→A sit side by side
              const mid: LatLon = [(a.lat + b.lat) / 2 + (b.lon - a.lon) * 0.08, (a.lon + b.lon) / 2 - (b.lat - a.lat) * 0.08]
              return (
                <Polyline
                  key={`${o.from}-${o.to}`}
                  positions={[[a.lat, a.lon], mid, [b.lat, b.lon]]}
                  pathOptions={{ color: '#d55181', weight: 1.5 + 8 * Math.sqrt(o.trips_day / maxTrips), opacity: 0.5, lineCap: 'round' }}
                >
                  <Tooltip sticky>
                    {t(a.name, a.name_ar)} → {t(b.name, b.name_ar)}: {fmtNum(o.trips_day, lang)} {t('trips a day (demo)', 'رحلة يوميًا (تجريبي)')}
                  </Tooltip>
                </Polyline>
              )
            })}

        {on.has('wifi') &&
          tel.wifi_zones.map((w) => (
            <CircleMarker key={w.id} center={[w.lat, w.lon]} radius={9} pathOptions={{ color: '#4fd06a', weight: 2, dashArray: '3 3', fillColor: '#0ca30c', fillOpacity: 0.25 }}>
              <Tooltip>
                {t('Proposed Wi-Fi zone', 'منطقة واي فاي مقترحة')} · {w.label}
              </Tooltip>
            </CircleMarker>
          ))}

        {on.has('spend') &&
          sites.map((s) => {
            const sp = tel.sites[s.id]
            if (!sp) return null
            const total = Object.values(sp.spend_sar_day).reduce((a, b) => a + b, 0)
            const now = total * (sp.spend_sar_hourly_share[hour] ?? 0)
            return (
              <CircleMarker key={`spend-${s.id}`} center={[s.lat - 0.0016, s.lon + 0.0016]} radius={4 + 22 * Math.sqrt(now / 2_500_000)} pathOptions={{ color: '#fab219', weight: 1.5, fillColor: '#fab219', fillOpacity: 0.35 }}>
                <Tooltip>
                  {t(s.name, s.name_ar)} · {fmtSar(now, lang)} {t('in this hour (demo)', 'في هذه الساعة (تجريبي)')}
                </Tooltip>
              </CircleMarker>
            )
          })}

        {sites.map((s) => {
          const v = on.has('visitors') ? presenceAt(tel, s.id, idx) : null
          const c = clusterOf(s)
          return (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lon]}
              radius={on.has('visitors') ? radius(v, s.id) : 7}
              pathOptions={{ color: sel?.id === s.id ? '#ffffff' : c.colour, weight: sel?.id === s.id ? 3 : 2, fillColor: c.colour, fillOpacity: on.has('visitors') ? 0.45 : 0.9 }}
              eventHandlers={{ click: () => select(s.id) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <b>{t(s.name, s.name_ar)}</b>
                {on.has('visitors') && (
                  <>
                    <br />
                    {v == null ? t('Under 25 devices (hidden)', 'أقل من ٢٥ جهازًا (مخفي)') : `${fmtNum(v, lang)} ${t('on site at', 'في الموقع الساعة')} ${fmtHour(hour)} · ${t('demo', 'تجريبي')}`}
                  </>
                )}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>

      <aside className={`map-panel layers-panel ${panelOpen ? '' : 'collapsed'}`} aria-label={t('Layers', 'الطبقات')}>
        <button className="panel-toggle" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
          <Icon name="layers" /> {t('Layers', 'الطبقات')}
        </button>
        {panelOpen && (
          <div className="panel-body">
            {LAYERS.map((g) => (
              <div key={g.group.en} className="layer-group">
                <div className="eyebrow">{t(g.group.en, g.group.ar)}</div>
                {g.items.map((it) => (
                  <label key={it.id} className={`layer-row ${missing(it.id) ? 'is-missing' : ''}`}>
                    <input type="checkbox" checked={on.has(it.id)} onChange={() => toggle(it.id)} disabled={missing(it.id)} />
                    <Icon name={it.icon} size={15} />
                    <span className="layer-name">{t(it.en, it.ar)}</span>
                    {missing(it.id) ? <Prov kind="pending" /> : <Prov kind={it.prov} />}
                  </label>
                ))}
              </div>
            ))}
            <div className="layer-group">
              <div className="eyebrow">{t('Base map', 'الخريطة الأساسية')}</div>
              <div className="seg" role="group">
                <button aria-pressed={base === 'dark'} onClick={() => setBase('dark')}>
                  {t('Dark', 'داكنة')}
                </button>
                <button aria-pressed={base === 'imagery'} onClick={() => setBase('imagery')}>
                  {t('Satellite', 'قمر صناعي')}
                </button>
              </div>
            </div>
            {on.has('pois') && (
              <div className="legend">
                {Object.entries(POI_LABEL).map(([k, [en, ar]]) => (
                  <span key={k} className="legend-item">
                    <span className="sw round" style={{ background: POI_COLOUR[k] }}></span>
                    {t(en, ar)}
                  </span>
                ))}
              </div>
            )}
            {on.has('traffic') && (
              <div className="legend">
                {[
                  ['#0ca30c', 'Free flow', 'انسيابية'],
                  ['#fab219', 'Busy', 'مزدحم'],
                  ['#ec835a', 'Heavy', 'كثيف'],
                  ['#d03b3b', 'Jammed', 'متوقف'],
                ].map(([c, en, ar]) => (
                  <span key={en} className="legend-item">
                    <span className="sw" style={{ background: c }}></span>
                    {t(en, ar)}
                  </span>
                ))}
              </div>
            )}
            <p className="panel-note">
              <DemoBadge /> {t('Visitor layers follow the shape of the STC request; real data replaces them.', 'طبقات الزوار تتبع صيغة طلب STC؛ وستحل البيانات الحقيقية محلها.')}
            </p>
          </div>
        )}
      </aside>

      {sel && <SiteDrawer data={data} site={sel} idx={idx} day={day} onClose={() => select(null)} />}

      <div className="timeline" aria-label={t('Time', 'الوقت')}>
        <div className="tl-days" role="group" aria-label={t('Day', 'اليوم')}>
          {tel.days.map((d, i) => (
            <button key={d.date} aria-pressed={i === day} onClick={() => setDay(i)} className={d.weekend ? 'weekend' : ''}>
              {fmtDate(d.date, lang, { weekday: 'short', day: 'numeric' })}
            </button>
          ))}
        </div>
        <div className="tl-main">
          <button className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('Pause', 'إيقاف') : t('Play the day', 'تشغيل اليوم')}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <div className="tl-track">
            <input type="range" min={0} max={23} value={hour} onChange={(e) => setHour(+e.target.value)} aria-label={t('Hour', 'الساعة')} />
            <div className="tl-prayers" aria-hidden="true">
              {prayers &&
                PRAYERS.map((p) => (
                  <span key={p.id} className="tl-prayer" style={{ insetInlineStart: `${(hhmmToHours(prayers[p.id]) / 23) * 100}%` }}>
                    {t(p.en, p.ar)}
                  </span>
                ))}
            </div>
          </div>
          <div className="tl-now">
            <span className="display tl-hour">{fmtHour(hour)}</span>
            {weather?.temp[hour] != null && (
              <span className={`tl-temp ${weather.feels[hour]! >= 40 ? 'hot' : ''}`} title={t('Feels-like temperature, Open-Meteo', 'درجة الحرارة المحسوسة، Open-Meteo')}>
                {Math.round(weather.temp[hour]!)}°C · {t('feels', 'يحس')} {Math.round(weather.feels[hour]!)}°
              </span>
            )}
          </div>
        </div>
      </div>

      {on.has('visitors') && (
        <div className="map-kpis">
          <span className="eyebrow">{t('On historic sites now (excl. Haram)', 'في المواقع التاريخية الآن (دون الحرم)')}</span>
          <span className="display kpi-inline">
            {fmtCompact(
              sites.filter((s) => s.id !== 'haram').reduce((a, s) => a + (presenceAt(tel, s.id, idx) ?? 0), 0),
              lang,
            )}
          </span>
          <DemoBadge />
        </div>
      )}
    </div>
  )
}

function SiteDrawer({ data, site, idx, day, onClose }: { data: AppData; site: Site; idx: number; day: number; onClose: () => void }) {
  const { t, lang } = useLang()
  const tel = data.telecom!
  const ts = tel.sites[site.id]
  const v = presenceAt(tel, site.id, idx)
  const poi = data.pois?.by_site[site.id]
  const reach = data.isochrones?.sites[site.id]?.reach_m2
  const stops = data.transport?.bus_stops.filter((s) => Math.hypot((s.lat - site.lat) * 111, (s.lon - site.lon) * 101) < 0.5).length
  const parks = data.transport?.parking.filter((s) => Math.hypot((s.lat - site.lat) * 111, (s.lon - site.lon) * 101) < 0.8).length
  const c = clusterOf(site)
  const next = tel.od
    .filter((o) => o.from === site.id)
    .sort((a, b) => b.trips_day - a.trips_day)
    .slice(0, 3)
  const siteName = (id: string) => {
    const s = data.sites!.sites.find((x) => x.id === id)
    return s ? t(s.name, s.name_ar) : id
  }

  return (
    <aside className="map-panel drawer" aria-label={t(site.name, site.name_ar)}>
      <button className="icon-btn drawer-close" onClick={onClose} aria-label={t('Close', 'إغلاق')}>
        <Icon name="close" />
      </button>
      {site.photo && (
        <figure className="drawer-photo">
          <img src={site.photo.url} alt={t(site.name, site.name_ar)} loading="lazy" />
          <figcaption>{site.photo.credit}</figcaption>
        </figure>
      )}
      <div className="drawer-body">
        <div className="eyebrow" style={{ color: c.colour }}>
          {t(c.en, c.ar)}
          {site.pilot_phase && ` · ${t('Pilot site', 'موقع تجريبي')} ${site.pilot_phase === 1 ? t('(first)', '(أولًا)') : t('(next)', '(لاحقًا)')}`}
        </div>
        <h2 className="display drawer-title">{t(site.name, site.name_ar)}</h2>
        <p className="drawer-desc">{t(site.desc, site.desc_ar)}</p>

        <div className="drawer-stats">
          <div>
            <span className="stat-label">
              {t('On site now', 'في الموقع الآن')} <Prov kind="illustrative" />
            </span>
            <span className="display stat-value">{v == null ? t('<25', '<٢٥') : fmtNum(v, lang)}</span>
          </div>
          <div>
            <span className="stat-label">
              {t('Visitors today', 'زوار اليوم')} <Prov kind="illustrative" />
            </span>
            <span className="display stat-value">{fmtCompact(ts?.daily_devices[day], lang)}</span>
          </div>
          <div>
            <span className="stat-label">
              {t('Median time on site', 'متوسط مدة البقاء')} <Prov kind="illustrative" />
            </span>
            <span className="display stat-value">
              {ts?.dwell.median_min ?? '–'} {t('min', 'د')}
            </span>
          </div>
          <div>
            <span className="stat-label">
              {t('Go on to another site', 'ينتقلون لموقع آخر')} <Prov kind="illustrative" />
            </span>
            <span className="display stat-value">{fmtPct(ts?.second_site_share, lang)}</span>
          </div>
        </div>

        {next.length > 0 && (
          <div className="drawer-section">
            <div className="eyebrow">{t('Where visitors go next', 'إلى أين يذهب الزوار بعدها')}</div>
            <ol className="next-list">
              {next.map((o) => (
                <li key={o.to}>
                  {siteName(o.to)} <span className="muted">· {fmtNum(o.trips_day, lang)} {t('a day', 'يوميًا')}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="drawer-section">
          <div className="eyebrow">
            {t('Within 800 m', 'ضمن ٨٠٠ م')} {poi ? <Prov kind="real" /> : <Prov kind="pending" />}
          </div>
          {poi ? (
            <div className="chip-row">
              {Object.entries(POI_LABEL).map(([k, [en, ar]]) => (
                <span key={k} className="chip">
                  <span className="sw round" style={{ background: POI_COLOUR[k] }}></span>
                  {fmtNum(poi[k] ?? 0, lang)} {t(en, ar)}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">{t('Open data not loaded yet.', 'لم تُحمّل البيانات المفتوحة بعد.')}</p>
          )}
          {reach?.['10'] != null && (
            <p className="muted small">
              {t('Walkable area in 10 minutes', 'المساحة الممكن مشيها في ١٠ دقائق')}: {fmtNum(reach['10'] / 1e6, lang, 2)} km²
            </p>
          )}
          {stops != null && (
            <p className="muted small">
              {fmtNum(stops, lang)} {t('bus stops within 500 m', 'محطة حافلات ضمن ٥٠٠ م')} · {fmtNum(parks ?? 0, lang)} {t('car parks within 800 m', 'موقفًا ضمن ٨٠٠ م')}
            </p>
          )}
        </div>

        <div className="drawer-actions">
          <a className="btn btn-accent" href={`#/sites/${site.id}`}>
            {t('Open site dashboard', 'لوحة الموقع')}
          </a>
          <a className="btn btn-ghost" href={`#/networks/${site.id}`}>
            {t('Network view', 'عرض الشبكة')}
          </a>
        </div>
      </div>
    </aside>
  )
}
