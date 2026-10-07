/**
 * Madinah-only map layers on top of the DHDE map:
 *  - CrowdLayer: people on foot at each site (arrive by an entrance, linger, leave by another)
 *  - ClusterLayer: the prototype's site clusters, outlined and labelled, with numbered badges
 *  - WalkLayer: 5/10/15-minute walking reach, shrinking to what is comfortable in the heat
 *  - BusinessLayer: shops, food, hotels and services (OpenStreetMap) with hour-by-hour busyness
 */
import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Polygon, Tooltip } from 'react-leaflet'
import { useLeafletLayer } from '../canvas/useLeafletLayer'
import { CrowdCanvas, TIMELAPSE } from '../canvas/CrowdCanvas'
import type { CrowdSite } from '../canvas/CrowdCanvas'
import type { NodeFrame } from '../../../lib/live'
import { useLang } from '../../../lib/i18n'
import type { IsochronesFile, LatLon, PoisFile, Site } from '../../../../types/data'

export interface MadinahExtras {
  sites: Site[]
  isochrones: IsochronesFile | null
  pois: PoisFile | null
}

export const CLUSTER_STYLE: Record<string, { colour: string; en: string; ar: string; tag: string }> = {
  A: { colour: '#199e70', en: 'Cluster A · Quba and the wells (central loop)', ar: 'المجموعة أ · قباء والآبار (الجولة الوسطى)', tag: 'A' },
  B: { colour: '#c98500', en: 'Cluster B · Uhud and al-Khandaq', ar: 'المجموعة ب · أحد والخندق', tag: 'B' },
  outlier: { colour: '#e66767', en: 'Stand-alone · Jabal Ayr (own itinerary)', ar: 'مستقل · جبل عير (مسار مستقل)', tag: '' },
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

export function CrowdLayer({ extras, frame }: { extras: MadinahExtras; frame: Record<string, NodeFrame> }) {
  const canvas = useLeafletLayer(() => new CrowdCanvas())
  const sites = useMemo<CrowdSite[]>(
    () =>
      extras.sites.map((s) => ({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        zoneM: ZONE_M[s.id] ?? 120,
        dwellMin: s.typical_visit_min,
        gates: gatesFor(s, extras.isochrones),
      })),
    [extras],
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

function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  if (p.length < 3) return p
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1])
  const lower: [number, number][] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: [number, number][] = []
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** A padded outline: each site becomes a small circle of points, then the hull of all of them. */
function padded(sites: Site[], padM: number): [number, number][] {
  const pts: [number, number][] = []
  for (const s of sites) {
    for (let a = 0; a < 360; a += 30) {
      const r = padM / 111320
      pts.push([s.lat + Math.cos((a * Math.PI) / 180) * r, s.lon + (Math.sin((a * Math.PI) / 180) * r) / Math.cos((s.lat * Math.PI) / 180)])
    }
  }
  return hull(pts)
}

export function ClusterLayer({ extras, onSelect }: { extras: MadinahExtras; onSelect: (id: string) => void }) {
  const { t } = useLang()
  const groups = useMemo(() => {
    const by: Record<string, Site[]> = { A: [], B: [], outlier: [] }
    for (const s of extras.sites) {
      const k = s.cluster === 'Asat' ? 'A' : s.cluster
      if (by[k]) by[k].push(s)
    }
    return by
  }, [extras.sites])

  return (
    <>
      {Object.entries(groups).map(([k, list]) => {
        if (!list.length) return null
        const st = CLUSTER_STYLE[k]
        const poly = padded(list, k === 'outlier' ? 900 : 420)
        return (
          <Polygon key={k} positions={poly} pathOptions={{ color: st.colour, weight: 1.5, dashArray: '6 6', fillColor: st.colour, fillOpacity: 0.07 }} interactive>
            <Tooltip sticky className="map-tip">
              <strong>{t(st.en, st.ar)}</strong>
              <div className="tip-row">
                {list.map((s) => `${s.num}. ${t(s.short, s.short_ar)}`).join(' · ')}
              </div>
              <div className="tip-sub">{t('Operators book a cluster as one itinerary (Operator view).', 'يحجز المشغلون المجموعة كمسار واحد (عرض المشغل).')}</div>
            </Tooltip>
          </Polygon>
        )
      })}
      {extras.sites
        .filter((s) => s.num > 0)
        .map((s) => {
          const st = CLUSTER_STYLE[s.cluster === 'Asat' ? 'A' : s.cluster] ?? CLUSTER_STYLE.A
          const icon = L.divIcon({
            className: 'site-num-icon',
            html: `<span class="site-num" style="background:${st.colour}">${s.num}</span>`,
            iconSize: [20, 20],
            iconAnchor: [24, 24],
          })
          return (
            <Marker key={s.id} position={[s.lat, s.lon]} icon={icon} eventHandlers={{ click: () => onSelect(s.id) }} zIndexOffset={800}>
              <Tooltip direction="top" offset={[-14, -24]} className="map-tip">
                {s.num}. {t(s.name, s.name_ar)}
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
