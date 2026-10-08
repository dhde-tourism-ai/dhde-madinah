/**
 * Heat view: a 3D look at heat, sun and shade at the sites, hour by hour.
 *
 *  - 3D terrain (open Terrarium elevation tiles) so Uhud and Jabal Ayr stand up
 *  - OpenStreetMap buildings extruded to their mapped or estimated heights
 *  - building shadows for the sun at the chosen hour
 *  - a ground "feels-like" heatmap over each site: the real hourly air temperature
 *    (Open-Meteo forecast) plus the extra heat of standing in direct sun (radiant load,
 *    larger when the sun is higher), less in shade; so the cooling that shade gives is
 *    visible, and each site shows how much a canopy over its sunlit ground would cool it
 *
 * The sun-load model is a planning approximation (MODELLED), not a measurement.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { AppData } from '../lib/data'
import { useLang } from '../lib/i18n'
import { clusterOf } from '../lib/sites'
import { Prov } from '../components/ui'
import { compass, sunAt } from '../dhde/lib/sun'
import type { Sun } from '../dhde/lib/sun'
import { inRing, inShade, shadowsFor } from '../dhde/lib/shade'
import type { Building, Ring, Shadow } from '../dhde/lib/shade'

interface SiteArea {
  area: Ring
}
interface LiveLite {
  start: string
  days: { date: string }[]
  nodes: Record<string, { weather: { temp_c: (number | null)[] } }>
}

/** Extra feels-like heat in direct sun vs shade (°C), from the sun's height. */
export function sunLoad(sun: Sun): { sunlit: number; shade: number } {
  if (sun.elevation <= 0) return { sunlit: -1, shade: -1 }
  const k = Math.sin((sun.elevation * Math.PI) / 180)
  return { sunlit: 2 + 10 * k, shade: 0.5 + 1.5 * k }
}

const RAMP: [number, string][] = [
  [26, '#2c7bb6'],
  [32, '#00a6ca'],
  [36, '#00ccbc'],
  [39, '#90eb9d'],
  [42, '#f9d057'],
  [45, '#f29e2e'],
  [48, '#e76818'],
  [52, '#d7191c'],
]

const toLngLat = (r: Ring): [number, number][] => r.map(([la, lo]) => [lo, la])
const closed = (r: [number, number][]) => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r)

function bbox(r: Ring) {
  let a = Infinity
  let b = Infinity
  let c = -Infinity
  let d = -Infinity
  for (const [la, lo] of r) {
    a = Math.min(a, la)
    b = Math.min(b, lo)
    c = Math.max(c, la)
    d = Math.max(d, lo)
  }
  return [a, b, c, d] as const
}

export default function HeatView({ data }: { data: AppData }) {
  const { t, lang } = useLang()
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [areas, setAreas] = useState<Record<string, SiteArea> | null>(null)
  const [buildings, setBuildings] = useState<Record<string, Building[]> | null>(null)
  const [live, setLive] = useState<LiveLite | null>(null)
  const nowRiyadh = new Date(Date.now() + 3 * 3600000)
  const [day, setDay] = useState(2)
  const [hour, setHour] = useState(() => {
    const h = Number(new URLSearchParams(window.location.search).get('h'))
    return h >= 0 && h <= 23 && new URLSearchParams(window.location.search).has('h') ? h : Math.max(6, Math.min(18, nowRiyadh.getUTCHours()))
  })
  const [playing, setPlaying] = useState(false)
  const [focus, setFocus] = useState<string>('haram')

  useEffect(() => {
    const get = (f: string) => fetch(`./data/${f}`).then((r) => (r.ok ? r.json() : null))
    get('site_areas.json').then((j) => setAreas(j?.sites ?? null))
    get('buildings.json').then((j) => setBuildings(j?.sites ?? null))
    get('live_demo.json').then((j) => setLive(j))
  }, [])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setHour((h) => (h >= 19 ? 5 : h + 1)), 1200)
    return () => window.clearInterval(id)
  }, [playing])

  const sites = useMemo(() => data.sites?.sites ?? [], [data.sites])
  const date = live?.days[day]?.date ?? nowRiyadh.toISOString().slice(0, 10)
  const sun = useMemo(() => sunAt(date, hour + 0.5), [date, hour])
  const load = sunLoad(sun)

  // air temperature for the hour (real Open-Meteo forecast via the map data)
  const airT = (id: string) => live?.nodes[id]?.weather.temp_c[day * 24 + hour] ?? live?.nodes.haram?.weather.temp_c[day * 24 + hour] ?? null

  const model = useMemo(() => {
    const shadowFeatures: GeoJSON.Feature[] = []
    const cellFeatures: GeoJSON.Feature[] = []
    const perSite: Record<string, { air: number | null; sunT: number | null; shadeT: number | null; share: number; cool: number }> = {}
    if (!areas) return { shadowFeatures, cellFeatures, perSite }
    for (const s of sites) {
      const a = areas[s.id]
      if (!a) continue
      const shadows: Shadow[] = buildings?.[s.id] ? shadowsFor(buildings[s.id], sun) : []
      for (const sh of shadows) shadowFeatures.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [closed(toLngLat(sh.ring))] } })
      const air = airT(s.id)
      const [la0, lo0, la1, lo1] = bbox(a.area)
      const step = s.id === 'haram' ? 22 : 12 // metres
      const dLa = step / 110540
      const dLo = step / (111320 * Math.cos((la0 * Math.PI) / 180))
      let n = 0
      let shaded = 0
      for (let la = la0; la < la1; la += dLa)
        for (let lo = lo0; lo < lo1; lo += dLo) {
          const c: [number, number] = [la + dLa / 2, lo + dLo / 2]
          if (!inRing(c[0], c[1], a.area)) continue
          n++
          const inS = sun.elevation <= 0 || inShade(c[0], c[1], shadows)
          if (inS) shaded++
          if (air == null) continue
          const tFeel = air + (inS ? load.shade : load.sunlit)
          cellFeatures.push({
            type: 'Feature',
            properties: { t: Math.round(tFeel * 10) / 10, shade: inS ? 1 : 0, site: s.id },
            geometry: { type: 'Polygon', coordinates: [[[lo, la], [lo + dLo, la], [lo + dLo, la + dLa], [lo, la + dLa], [lo, la]]] },
          })
        }
      const share = n ? shaded / n : 0
      perSite[s.id] = {
        air,
        sunT: air == null ? null : air + load.sunlit,
        shadeT: air == null ? null : air + load.shade,
        share: sun.elevation <= 0 ? 1 : share,
        cool: sun.elevation <= 0 ? 0 : (1 - share) * (load.sunlit - load.shade),
      }
    }
    return { shadowFeatures, cellFeatures, perSite }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, buildings, sites, sun, live, day, hour])

  // map setup
  useEffect(() => {
    if (!box.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: box.current,
      style: {
        version: 8,
        sources: {
          img: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
          dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 14, attribution: 'Terrain: Mapzen Terrarium (AWS Open Data)' },
        },
        layers: [
          { id: 'img', type: 'raster', source: 'img', paint: { 'raster-saturation': -0.35, 'raster-brightness-max': 0.75 } },
          { id: 'hill', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#0a1a14' } },
        ],
      },
      center: [39.6112, 24.4672],
      zoom: 15.6,
      pitch: 58,
      bearing: -25,
      maxPitch: 75,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    // 'style.load' (not 'load'): our layers go in as soon as the style is ready, without
    // waiting for every imagery and terrain tile to arrive.
    map.once('style.load', () => {
      map.setTerrain({ source: 'dem', exaggeration: 1.3 })
      map.addSource('cells', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('shadows', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('bldg', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'cells',
        type: 'fill',
        source: 'cells',
        paint: {
          'fill-color': ['interpolate', ['linear'], ['get', 't'], ...RAMP.flat()] as unknown as maplibregl.ExpressionSpecification,
          'fill-opacity': 0.62,
        },
      })
      map.addLayer({ id: 'shadows', type: 'fill', source: 'shadows', paint: { 'fill-color': '#0d1b4a', 'fill-opacity': 0.42 } })
      map.addLayer({
        id: 'bldg',
        type: 'fill-extrusion',
        source: 'bldg',
        paint: {
          'fill-extrusion-color': ['case', ['get', 'est'], '#cfc6b4', '#efe6d2'],
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-opacity': 0.88,
          'fill-extrusion-vertical-gradient': true,
        },
      })
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'heat-pop' })
      map.on('mousemove', 'cells', (e) => {
        const f = e.features?.[0]
        if (!f) return
        pop.setLngLat(e.lngLat).setHTML(`<b>${f.properties.t}°C</b> ${f.properties.shade ? 'in shade' : 'in direct sun'}`).addTo(map)
      })
      map.on('mouseleave', 'cells', () => pop.remove())
      setReady(true)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // buildings once
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !buildings) return
    const feats: GeoJSON.Feature[] = Object.values(buildings)
      .flat()
      .map((b) => ({ type: 'Feature', properties: { h: b.h, est: b.est }, geometry: { type: 'Polygon', coordinates: [closed(toLngLat(b.ring))] } }))
    ;(map.getSource('bldg') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
  }, [ready, buildings])

  // cells and shadows per hour
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('cells') as GeoJSONSource).setData({ type: 'FeatureCollection', features: model.cellFeatures })
    ;(map.getSource('shadows') as GeoJSONSource).setData({ type: 'FeatureCollection', features: model.shadowFeatures })
    // light the 3D buildings from the sun
    if (sun.elevation > 0) map.setLight({ anchor: 'map', position: [1.15, (sun.azimuth + 180) % 360, 90 - sun.elevation], intensity: 0.55, color: '#fff3d6' })
    else map.setLight({ anchor: 'map', position: [1.15, 210, 30], intensity: 0.25, color: '#9fb4ff' })
  }, [ready, model, sun])

  const flyTo = (id: string) => {
    const s = sites.find((x) => x.id === id)
    if (!s || !mapRef.current) return
    setFocus(id)
    const mountain = id === 'uhud' || id === 'jabal-ayr'
    mapRef.current.flyTo({ center: [s.lon, s.lat], zoom: mountain ? 14.6 : id === 'haram' ? 15.6 : 16.6, pitch: mountain ? 70 : 60, bearing: mountain ? 20 : -25, duration: 1600 })
  }

  const [dirEn, dirAr] = compass(sun.azimuth)
  const a = (sun.azimuth * Math.PI) / 180
  const fmt = (x: number | null | undefined) => (x == null ? '–' : `${Math.round(x)}°`)

  return (
    <div className="heat-view">
      <div ref={box} className="heat-map" />
      <aside className="heat-panel">
        <div className="eyebrow">{t('Heat view · 3D', 'عرض الحرارة · ثلاثي الأبعاد')}</div>
        <h1 className="display heat-title">{t('Temperature, sun angle and the cooling that shade gives', 'الحرارة وزاوية الشمس والتبريد الذي يوفره الظل')}</h1>

        <div className="heat-sun">
          <svg viewBox="-24 -24 48 48" width="56" height="56" aria-hidden="true">
            <circle r="21" fill="none" stroke="rgba(255,255,255,.25)" />
            <text y="-13" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,.6)">N</text>
            {sun.elevation > 0 ? <circle cx={Math.sin(a) * 16} cy={-Math.cos(a) * 16} r="6" fill="#ffc94a" stroke="#fff3c4" /> : <circle r="5" fill="#c9d4ff" />}
          </svg>
          <div>
            <b>{sun.elevation > 0 ? t(`Sun ${Math.round(sun.elevation)}° high, from the ${dirEn}`, `الشمس بارتفاع ${Math.round(sun.elevation)}° من ${dirAr}`) : t('Night: no sun', 'ليل: لا شمس')}</b>
            <span>
              {t('Air', 'الهواء')} {fmt(airT('haram'))}C · {t('direct sun adds', 'الشمس المباشرة تضيف')} +{Math.max(0, Math.round(load.sunlit))}° · {t('shade', 'الظل')} +{Math.max(0, Math.round(load.shade))}°
            </span>
          </div>
        </div>

        <div className="heat-time">
          <div className="seg" role="group" aria-label={t('Day', 'اليوم')}>
            {(live?.days ?? []).slice(0, 7).map((d, i) => (
              <button key={d.date} aria-pressed={i === day} onClick={() => setDay(i)}>
                {new Date(d.date + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric' })}
              </button>
            ))}
          </div>
          <div className="heat-slider">
            <button className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('Pause', 'إيقاف') : t('Play the day', 'تشغيل اليوم')}>
              {playing ? '❚❚' : '▶'}
            </button>
            <input type="range" min={0} max={23} value={hour} onChange={(e) => setHour(+e.target.value)} aria-label={t('Hour', 'الساعة')} />
            <b className="tnum">{String(hour).padStart(2, '0')}:00</b>
          </div>
        </div>

        <div className="heat-legend">
          <span>{t('Feels-like on the ground', 'الحرارة المحسوسة على الأرض')}</span>
          <div className="heat-ramp" style={{ background: `linear-gradient(90deg, ${RAMP.map(([, c]) => c).join(',')})` }} />
          <div className="heat-ramp-lab">
            <span>26°</span>
            <span>39°</span>
            <span>52°C</span>
          </div>
          <div className="heat-key">
            <span className="sq" style={{ background: '#0d1b4a' }} /> {t('building shadow', 'ظل المباني')} <span className="sq" style={{ background: '#efe6d2' }} /> {t('buildings (3D)', 'المباني (ثلاثي الأبعاد)')}
          </div>
        </div>

        <table className="tbl heat-tbl">
          <thead>
            <tr>
              <th>{t('Site', 'الموقع')}</th>
              <th className="num-cell">{t('Sun', 'شمس')}</th>
              <th className="num-cell">{t('Shade', 'ظل')}</th>
              <th className="num-cell">{t('Shaded', 'مظلل')}</th>
              <th className="num-cell" title={t('How much cooler the site would feel on average if its sunlit ground were shaded', 'كم سيبرد الموقع في المتوسط لو ظُلّلت أرضه المشمسة')}>
                {t('Canopy cools', 'تبريد المظلة')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const p = model.perSite[s.id]
              if (!p) return null
              return (
                <tr key={s.id} className={focus === s.id ? 'is-selected' : ''} onClick={() => flyTo(s.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span className="num-badge" style={{ background: clusterOf(s).colour }}>
                      {s.num || '•'}
                    </span>{' '}
                    {t(s.short, s.short_ar)}
                  </td>
                  <td className="num-cell tnum hot">{fmt(p.sunT)}</td>
                  <td className="num-cell tnum cool">{fmt(p.shadeT)}</td>
                  <td className="num-cell tnum">{Math.round(p.share * 100)}%</td>
                  <td className="num-cell tnum">{p.cool > 0.5 ? `−${p.cool.toFixed(1)}°` : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="muted small">
          <Prov kind="modelled" />{' '}
          {t(
            'Air temperature: Open-Meteo forecast (real). Sun load in direct sun vs shade: modelled from the sun’s height. Shadows from OpenStreetMap buildings (heights mapped or estimated); terrain from open elevation tiles. Drag with right-click (or two fingers) to tilt and turn.',
            'حرارة الهواء: توقعات Open-Meteo (حقيقية). حمل الشمس: نموذج من ارتفاع الشمس. الظلال من مباني OpenStreetMap؛ التضاريس من بيانات ارتفاع مفتوحة.',
          )}
        </p>
      </aside>
    </div>
  )
}
