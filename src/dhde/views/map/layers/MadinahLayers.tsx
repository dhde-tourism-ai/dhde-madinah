/**
 * Madinah-only map layers on top of the DHDE map:
 *  - CrowdLayer: people on foot at each site (arrive by an entrance, linger, leave by another)
 *  - ClusterLayer: the prototype's site clusters, outlined and labelled, with numbered badges
 *  - WalkLayer: 5/10/15-minute walking reach, shrinking to what is comfortable in the heat
 *  - BusinessLayer: shops, food, hotels and services (OpenStreetMap) with hour-by-hour busyness
 */
import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Polygon, Polyline, Tooltip } from 'react-leaflet'
import { useLeafletLayer } from '../canvas/useLeafletLayer'
import { CrowdCanvas, TIMELAPSE } from '../canvas/CrowdCanvas'
import type { CrowdSite } from '../canvas/CrowdCanvas'
import type { NodeFrame } from '../../../lib/live'
import { useLang } from '../../../lib/i18n'
import type { IsochronesFile, LatLon, PoisFile, Site } from '../../../../types/data'
import { ShadeCanvas } from '../canvas/ShadeCanvas'
import { shadeShare, shadowsFor } from '../../../lib/shade'
import type { Building, Ring, Shadow } from '../../../lib/shade'
import { compass, sunAt } from '../../../lib/sun'
import type { Sun } from '../../../lib/sun'

export interface SiteArea {
  kind: string
  area_m2: number
  area: Ring
  gates: { lat: number; lon: number; kind: string; name: string }[]
}

export interface MadinahExtras {
  sites: Site[]
  isochrones: IsochronesFile | null
  pois: PoisFile | null
  /** OSM footprint per site and its drop-off points (site_areas.json). */
  areas: Record<string, SiteArea> | null
  /** Buildings near each site, for shadows (buildings.json). */
  buildings: Record<string, Building[]> | null
  /** Road legs between sites (coach_legs.json), for the cluster loops. */
  legs: Record<string, { path: [number, number][] }> | null
  /** Coach starting points (hotel districts, airport, station, terminal). */
  origins: { id: string; label: string; label_ar: string; lat: number; lon: number }[]
}

/** Sun and shadows for a date and fractional hour, per site (memoised by the caller). */
export function shadowsAt(extras: MadinahExtras, date: string, hour: number): { sun: Sun; bySite: Record<string, Shadow[]> } {
  const sun = sunAt(date, hour)
  const bySite: Record<string, Shadow[]> = {}
  for (const s of extras.sites) bySite[s.id] = extras.buildings?.[s.id] ? shadowsFor(extras.buildings[s.id], sun) : []
  return { sun, bySite }
}

export const CLUSTER_STYLE: Record<string, { colour: string; en: string; ar: string; tag: string }> = {
  A: { colour: '#0ca3a3', en: 'Cluster A · Quba and the wells (central loop)', ar: 'المجموعة أ · قباء والآبار (الجولة الوسطى)', tag: 'A' },
  B: { colour: '#eda100', en: 'Cluster B · Uhud and al-Khandaq', ar: 'المجموعة ب · أحد والخندق', tag: 'B' },
  outlier: { colour: '#d03b3b', en: 'Stand-alone · Jabal Ayr (own itinerary)', ar: 'مستقل · جبل عير (مسار مستقل)', tag: '' },
}

const ZONE_M: Record<string, number> = {
  haram: 420, quba: 160, shuhada: 180, uhud: 200, qiblatain: 120, 'al-khandaq': 150, 'biography-museum': 110,
  safiya: 140, 'faqir-well': 50, 'gharas-well': 50, 'al-hayy': 120, 'jabal-ayr': 150,
}

/* ---------------------------------------------------------------- crowd */

/** Entrances: the 5-minute walking edge in four directions (street-connected), else a ring. */
function gatesFor(s: Site, iso: IsochronesFile | null): [number, number][] {
  const ring = (iso?.sites[s.id]?.['5'] as LatLon[] | undefined) ?? []
  const out: [number, number][] = []
  for (const b of [45, 135, 225, 315]) {
    let best: LatLon | null = null
    let score = -Infinity
    for (const p of ring) {
      const dy = p[0] - s.lat
      const dx = (p[1] - s.lon) * Math.cos((s.lat * Math.PI) / 180)
      const ang = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
      const diff = Math.min(Math.abs(ang - b), 360 - Math.abs(ang - b))
      const d = Math.hypot(dx, dy)
      const sc = d * 1000 - diff * 0.6
      if (diff < 45 && sc > score) {
        score = sc
        best = p
      }
    }
    if (best) out.push([best[0], best[1]])
    else {
      const r = ((ZONE_M[s.id] ?? 120) * 2.2 + 120) / 111320
      out.push([s.lat + Math.cos((b * Math.PI) / 180) * r, s.lon + (Math.sin((b * Math.PI) / 180) * r) / Math.cos((s.lat * Math.PI) / 180)])
    }
  }
  return out
}

export function CrowdLayer({ extras, frame, date, hour }: { extras: MadinahExtras; frame: Record<string, NodeFrame>; date: string; hour: number }) {
  const canvas = useLeafletLayer(() => new CrowdCanvas())
  const shade = useMemo(() => shadowsAt(extras, date, hour + 0.5), [extras, date, hour])
  const sites = useMemo<CrowdSite[]>(
    () =>
      extras.sites.map((s) => {
        const a = extras.areas?.[s.id]
        const temp = frame[s.id]?.weather.temp ?? 30
        return {
          id: s.id,
          lat: s.lat,
          lon: s.lon,
          zoneM: ZONE_M[s.id] ?? 120,
          dwellMin: s.typical_visit_min,
          // arrive from real drop-off points (car parks, bus stops) where known
          gates: a && a.gates.length >= 2 ? a.gates.map((g) => [g.lat, g.lon] as [number, number]) : gatesFor(s, extras.isochrones),
          area: a?.area,
          shadows: shade.bySite[s.id],
          hot: temp >= 32 && shade.sun.elevation > 5,
        }
      }),
    [extras, shade, frame],
  )
  useEffect(() => {
    const counts: Record<string, number> = {}
    for (const s of sites) {
      const n = frame[s.id]?.onSite ?? 0
      counts[s.id] = n <= 0 ? 0 : Math.max(3, Math.min(s.id === 'haram' ? 120 : 80, Math.round(Math.sqrt(n) * 0.9)))
    }
    canvas.setData(sites, counts)
  }, [canvas, sites, frame])
  return null
}

export const CROWD_NOTE = `One dot ≈ a group on foot. Time-lapse ${TIMELAPSE}×: a visit plays in minutes.`

/* ---------------------------------------------------------------- clusters */

/**
 * The prototype's cluster loops (dhde-ai-demo/medina MEDINA_ROUTE_DEFS): the order a coach
 * visits a cluster, drawn on the real roads in the cluster colour. Links between clusters
 * (Jabal Ayr to Quba, Shuhada to the museums) are dashed.
 */
const LOOPS: { from: string; to: string; cluster: string; link?: boolean }[] = [
  { from: 'faqir-well', to: 'gharas-well', cluster: 'A' },
  { from: 'gharas-well', to: 'quba', cluster: 'A' },
  { from: 'quba', to: 'safiya', cluster: 'A' },
  { from: 'safiya', to: 'biography-museum', cluster: 'A' },
  { from: 'biography-museum', to: 'al-hayy', cluster: 'A' },
  { from: 'al-hayy', to: 'qiblatain', cluster: 'A' },
  { from: 'uhud', to: 'shuhada', cluster: 'B' },
  { from: 'shuhada', to: 'al-khandaq', cluster: 'B' },
  { from: 'shuhada', to: 'biography-museum', cluster: 'B', link: true },
  { from: 'jabal-ayr', to: 'quba', cluster: 'outlier', link: true },
]

function legPath(extras: MadinahExtras, a: string, b: string): [number, number][] | null {
  const f = extras.legs?.[`${a}|${b}`]
  if (f) return f.path
  const r = extras.legs?.[`${b}|${a}`]
  if (r) return [...r.path].reverse()
  const sa = extras.sites.find((s) => s.id === a)
  const sb = extras.sites.find((s) => s.id === b)
  return sa && sb ? [[sa.lat, sa.lon], [sb.lat, sb.lon]] : null
}

export function ClusterLayer({ extras, onSelect }: { extras: MadinahExtras; onSelect: (id: string) => void }) {
  const { t } = useLang()
  const name = (id: string) => {
    const s = extras.sites.find((x) => x.id === id)
    return s ? `${s.num}. ${t(s.short, s.short_ar)}` : id
  }
  return (
    <>
      {LOOPS.map((l) => {
        const path = legPath(extras, l.from, l.to)
        if (!path) return null
        const st = CLUSTER_STYLE[l.cluster]
        return (
          <Polyline
            key={`${l.from}-${l.to}`}
            positions={path}
            pathOptions={{ color: st.colour, weight: l.link ? 2.5 : 4, opacity: l.link ? 0.6 : 0.75, dashArray: l.link ? '6 7' : undefined, lineCap: 'round' }}
          >
            <Tooltip sticky className="map-tip">
              <strong>{t(st.en, st.ar)}</strong>
              <div className="tip-row">
                {name(l.from)} → {name(l.to)}
              </div>
              <div className="tip-sub">{l.link ? t('Link between clusters', 'رابط بين المجموعات') : t('Suggested coach loop, as booked in the Operator view', 'الجولة المقترحة للحافلات كما تُحجز في عرض المشغل')}</div>
            </Tooltip>
          </Polyline>
        )
      })}
      {extras.sites
        .filter((s) => s.num > 0)
        .map((s) => {
          const st = CLUSTER_STYLE[s.cluster === 'Asat' ? 'A' : s.cluster] ?? CLUSTER_STYLE.A
          const icon = L.divIcon({
            className: 'site-num-icon',
            html: `<span class="site-num big" style="background:${st.colour}">${s.num}</span>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          })
          return (
            <Marker key={s.id} position={[s.lat, s.lon]} icon={icon} eventHandlers={{ click: () => onSelect(s.id) }} zIndexOffset={800}>
              <Tooltip direction="top" offset={[0, -22]} className="map-tip">
                <strong>
                  {s.num}. {t(s.name, s.name_ar)}
                </strong>
                <div className="tip-row">{t(st.en, st.ar)}</div>
              </Tooltip>
            </Marker>
          )
        })}
    </>
  )
}

/* ---------------------------------------------------------------- walking reach */

/** Minutes of walking that stay comfortable at a temperature (shade-less streets). */
export function comfortableWalk(temp: number): number {
  return temp >= 42 ? 5 : temp >= 38 ? 10 : 15
}

export function WalkLayer({ extras, frame }: { extras: MadinahExtras; frame: Record<string, NodeFrame> }) {
  const { t } = useLang()
  const iso = extras.isochrones
  if (!iso) return null
  return (
    <>
      {extras.sites.map((s) => {
        const rings = iso.sites[s.id]
        if (!rings) return null
        const temp = frame[s.id]?.weather.temp ?? 30
        const ok = comfortableWalk(temp)
        return [...iso.minutes].reverse().map((m) => {
          const ring = rings[String(m)] as LatLon[] | undefined
          if (!ring?.length) return null
          const hot = m > ok
          const op = m === 5 ? 0.24 : m === 10 ? 0.15 : 0.09
          return (
            <Polygon
              key={`${s.id}-${m}`}
              positions={ring}
              pathOptions={{ color: hot ? '#ec835a' : '#6da7ec', weight: 1, dashArray: hot ? '4 4' : undefined, fillColor: hot ? '#d03b3b' : '#3987e5', fillOpacity: hot ? op * 0.6 : op }}
            >
              <Tooltip sticky className="map-tip">
                <strong>
                  {t(s.short, s.short_ar)} · {m} {t('min walk', 'دقيقة مشيًا')}
                </strong>
                <div className="tip-row">
                  {hot
                    ? t(`Too hot to walk this far now (${Math.round(temp)}°C): comfortable reach is ${ok} min. Shade and water points extend it.`, `حار جدًا للمشي هذه المسافة الآن (${Math.round(temp)}°): المدى المريح ${ok} دقائق.`)
                    : t(`Comfortable now (${Math.round(temp)}°C).`, `مريح الآن (${Math.round(temp)}°).`)}
                </div>
                <div className="tip-sub">{t('OpenStreetMap walking network, 4.5 km/h', 'شبكة المشي في OpenStreetMap، ٤٫٥ كم/س')}</div>
              </Tooltip>
            </Polygon>
          )
        })
      })}
    </>
  )
}

/* ---------------------------------------------------------------- businesses */

export const BIZ: Record<string, { colour: string; en: string; ar: string }> = {
  food: { colour: '#ec835a', en: 'Restaurants and cafés', ar: 'مطاعم ومقاهٍ' },
  shop: { colour: '#b18cff', en: 'Shops and souvenirs', ar: 'متاجر وهدايا' },
  lodging: { colour: '#5b9cf0', en: 'Hotels', ar: 'فنادق' },
  services: { colour: '#3dbb6e', en: 'Toilets, water, ATMs, pharmacies', ar: 'خدمات' },
  shade: { colour: '#7fd1b0', en: 'Shade and parks', ar: 'ظل وحدائق' },
  mosque: { colour: '#e0a33a', en: 'Mosques', ar: 'مساجد' },
}

/**
 * Busyness 0..1 by category and hour (a typical-day curve, like map apps' "popular times"):
 * meals after Dhuhr and after Isha, shopping in the evening, a dip during each prayer.
 * Illustrative until a busyness feed (Google Places or card spend by hour) is connected.
 */
export function busyness(cat: string, hour: number, prayers: number[]): number {
  const g = (c: number, w: number) => Math.exp(-((hour + 0.5 - c) ** 2) / (2 * w * w))
  let v: number
  if (cat === 'food') v = 0.15 + 0.55 * g(13.5, 1.3) + 0.8 * g(21, 1.6) + 0.25 * g(8, 1)
  else if (cat === 'shop') v = 0.1 + 0.35 * g(11, 2) + 0.85 * g(21, 2.2)
  else if (cat === 'lodging') v = 0.35 + 0.4 * g(14, 2) + 0.3 * g(22, 2)
  else if (cat === 'mosque') v = 0.1 + prayers.reduce((a, p) => a + 0.9 * g(p + 0.3, 0.5), 0)
  else v = 0.25 + 0.5 * g(12, 4)
  if (cat === 'shop' || cat === 'food') for (const p of prayers) if (Math.abs(hour + 0.5 - (p + 0.3)) < 0.4) v *= 0.35
  if (hour < 5) v *= 0.3
  return Math.max(0, Math.min(1, v))
}

export function BusinessLayer({ extras, hour, prayers }: { extras: MadinahExtras; hour: number; prayers: number[] }) {
  const { t } = useLang()
  if (!extras.pois) return null
  return (
    <>
      {extras.pois.points.map((p, i) => {
        const b = BIZ[p.cat] ?? BIZ.services
        const busy = busyness(p.cat, hour, prayers)
        const label = busy > 0.75 ? t('Busy now', 'مزدحم الآن') : busy > 0.45 ? t('Moderately busy', 'متوسط الازدحام') : busy > 0.2 ? t('Quiet', 'هادئ') : t('Very quiet or closed', 'هادئ جدًا أو مغلق')
        return (
          <CircleMarker key={i} center={[p.lat, p.lon]} radius={2 + busy * 4.5} pathOptions={{ stroke: busy > 0.75, color: '#ffffff', weight: 1, fillColor: b.colour, fillOpacity: 0.35 + busy * 0.6 }}>
            <Tooltip className="map-tip">
              <strong>{p.name || t(b.en, b.ar)}</strong>
              <div className="tip-row">
                {t(b.en, b.ar)} · {label}
              </div>
              <div className="tip-sub">{t('Place: OpenStreetMap (real). Busyness: typical-day curve (demo).', 'المكان: OpenStreetMap (حقيقي). الازدحام: منحنى يوم نموذجي (تجريبي).')}</div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}

/* ---------------------------------------------------------------- sun and shade */

export function ShadeLayer({ extras, date, hour, frame }: { extras: MadinahExtras; date: string; hour: number; frame: Record<string, NodeFrame> }) {
  const { t } = useLang()
  const canvas = useLeafletLayer(() => new ShadeCanvas())
  const shade = useMemo(() => shadowsAt(extras, date, hour + 0.5), [extras, date, hour])
  useEffect(() => {
    const areas = extras.sites.map((s) => extras.areas?.[s.id]?.area).filter((a): a is Ring => Boolean(a && a.length > 2))
    canvas.setData(Object.values(shade.bySite).flat(), shade.sun, areas)
  }, [canvas, shade, extras])
  const sun = shade.sun
  const [dirEn, dirAr] = compass(sun.azimuth)
  return (
    <>
      {extras.sites.map((s) => {
        const a = extras.areas?.[s.id]
        if (!a) return null
        const share = sun.elevation > 1 ? shadeShare(a.area, shade.bySite[s.id] ?? []) : 1
        const temp = frame[s.id]?.weather.temp ?? null
        const exposed = sun.elevation > 1 && share < 0.25 && (temp ?? 0) >= 35
        return (
          <Polygon
            key={s.id}
            positions={a.area}
            pathOptions={{ color: exposed ? '#ff8a3d' : '#ffd166', weight: exposed ? 2.5 : 1.2, dashArray: exposed ? undefined : '3 4', fill: true, fillOpacity: 0 }}
          >
            <Tooltip sticky className="map-tip">
              <strong>
                {t(s.short, s.short_ar)} · {t('shade now', 'الظل الآن')} {Math.round(share * 100)}%
              </strong>
              <div className="tip-row">
                {sun.elevation > 1
                  ? t(`Sun from the ${dirEn}, ${Math.round(sun.elevation)}° high${temp != null ? `, ${Math.round(temp)}°C` : ''}.`, `الشمس من ${dirAr}، بارتفاع ${Math.round(sun.elevation)}°${temp != null ? `، ${Math.round(temp)}°` : ''}.`)
                  : t('Sun below the horizon: the whole site is in shade.', 'الشمس تحت الأفق: الموقع كله في الظل.')}
              </div>
              {exposed && <div className="tip-row warn-text">{t('Mostly in full sun in the heat: a priority for shade canopies and rest points.', 'معظمه تحت الشمس في الحر: أولوية للمظلات ونقاط الاستراحة.')}</div>}
              <div className="tip-sub">{t('Shadows from OpenStreetMap buildings (heights mapped or estimated) and the sun position for this hour.', 'الظلال من مباني OpenStreetMap (ارتفاعات مسجلة أو مقدرة) وموقع الشمس لهذه الساعة.')}</div>
            </Tooltip>
          </Polygon>
        )
      })}
    </>
  )
}

/* ---------------------------------------------------------------- occupancy halos */

/**
 * The prototype's occupancy halos: soft concentric rings in the site's cluster colour that
 * grow and brighten with how full the site is this hour (people on site against its
 * comfortable level). Neighbouring sites blend into a shared glow.
 */
const HALO_FACTORS = [1, 1.8, 2.7, 3.7]
const HALO_OPACITY = [0.3, 0.17, 0.09, 0.04]

export function OccupancyHalos({ extras, frame }: { extras: MadinahExtras; frame: Record<string, NodeFrame> }) {
  return (
    <>
      {extras.sites.map((s) => {
        const f = frame[s.id]
        if (!f) return null
        const st = s.id === 'haram' ? { colour: '#c99a3b' } : (CLUSTER_STYLE[s.cluster === 'Asat' ? 'A' : s.cluster] ?? CLUSTER_STYLE.A)
        const load = Math.max(0, Math.min(1.4, f.load))
        const base = 22 + Math.sqrt(load) * 38
        const w = Math.max(0.55, Math.min(1.3, load + 0.35))
        return HALO_FACTORS.map((k, i) => (
          <CircleMarker
            key={`${s.id}-${i}`}
            center={[s.lat, s.lon]}
            radius={base * k}
            interactive={false}
            pathOptions={{ stroke: false, fillColor: st.colour, fillOpacity: HALO_OPACITY[i] * w }}
          />
        ))
      })}
    </>
  )
}

/* ---------------------------------------------------------------- starting points */

const ORIGIN_ICON: Record<string, string> = {
  haram: '🕌', 'quba-hotels': '🏨', 'airport-rd': '🏨', airport: '✈️', 'rail-station': '🚄', 'bus-terminal': '🚌', markaziya: '🏨', 'taibah-u': '🎓',
}

/** Where tour coaches start (hotel districts, the airport, the Haramain station, the coach terminal). */
export function OriginMarkers({ origins }: { origins: { id: string; label: string; label_ar: string; lat: number; lon: number }[] }) {
  const { t } = useLang()
  return (
    <>
      {origins.map((o) => (
        <Marker
          key={o.id}
          position={[o.lat, o.lon]}
          zIndexOffset={600}
          icon={L.divIcon({ className: 'origin-icon', html: `<div class="morigin-badge">${ORIGIN_ICON[o.id] ?? '📍'}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] })}
        >
          <Tooltip permanent direction="right" offset={[18, 0]} className="morigin-label">
            {t('Starting point', 'نقطة الانطلاق')}: {t(o.label, o.label_ar)}
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}
