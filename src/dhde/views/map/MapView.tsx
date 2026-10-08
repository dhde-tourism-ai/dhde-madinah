import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import type L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../../styles/map.css'
import '../../styles/map-layers.css'
import type { DashboardData } from '../../types/dashboard'
import type { NodeRegistry } from '../../types/nodes'
import type { RegionalEconomics } from '../../types/economics'
import type { LiveData } from '../../types/live'
import type { RoutesFile } from '../../types/routes'
import type { MarketVoiceData } from '../../types/market'
import type { TransportFile, TransportMapFile, TransportTripsFile } from '../../types/transport'
import { buildMapNodes } from '../../lib/nodes'
import { frameAt, timeLabel } from '../../lib/live'
import { computeAlerts, SEV_COLOUR, topAlert } from '../../lib/alerts'
import { computeNudges, topPerDay } from '../../lib/nudges'
import type { HotelThresholds, Nudge } from '../../lib/nudges'
import { useJsonResource } from '../../hooks/useJsonResource'
import { useLang } from '../../lib/i18n'
import { useIsNarrow } from '../../hooks/useIsNarrow'
import { Icon } from '../../components/icons'
import { DemoBadge } from '../../components/DemoBadge'
import { SourceBadge } from '../../components/SourceBadge'
import { DEFAULT_LAYERS, OVERVIEW_NOTE, readStoredLayers, readUrlState, storeLayers, TOWN_LAYERS } from './layers'
import type { BasemapId, LayerId } from './layers'
import { PeopleLayer } from './layers/PeopleLayer'
import { SiteMarkers } from './layers/SiteMarkers'
import { FlowLayer } from './layers/FlowLayer'
import { TrafficLayer } from './layers/TrafficLayer'
import { WeatherLayer } from './layers/WeatherLayer'
import { SentimentLayer } from './layers/SentimentLayer'
import { DensityLayer } from './layers/FieldLayers'
import { EconomicsLayer } from './layers/EconomicsLayer'
import { LayersPanel } from './panels/LayersPanel'
import { AlertsPanel } from './panels/AlertsPanel'
import { NodeDrawer } from './panels/NodeDrawer'
import { Timeline } from './panels/Timeline'
import { NudgesPanel } from './panels/NudgesPanel'
import { NudgeLayer } from './layers/NudgeLayer'
import { TransportLayer } from './layers/TransportLayer'
import { VehiclesLayer } from './layers/VehiclesLayer'
import { buildRuns } from '../../lib/railModel'
import type { RailRun } from '../../lib/railModel'
import { HotelsLayer, RsiLayer } from './layers/VoiceMarketLayers'
import { SiteCards } from './layers/SiteCards'
import { Declutter } from './Declutter'
import { CoachesLayer } from './layers/CoachesLayer'
import type { CoachItem } from './canvas/CoachCanvas'
import { BusinessLayer, ClusterLayer, CrowdLayer, ShadeLayer, WalkLayer } from './layers/MadinahLayers'
import type { MadinahExtras } from './layers/MadinahLayers'
import { VehicleHover } from './layers/VehicleHover'
import { PrayerCard, PRAYER_NAMES } from './panels/PrayerCard'

/** Madinah: the Haram, both site clusters, Jabal Ayr to the south and the airport to the north-east. */
const VIEW_BOUNDS: [[number, number], [number, number]] = [
  [24.4, 39.56],
  [24.545, 39.7],
]

/** ?at=lat,lon,zoom opens the map there (shareable close-ups, e.g. one site's crowd). */
function urlAt(): [number, number, number] | null {
  const v = new URLSearchParams(window.location.search).get('at')?.split(',').map(Number)
  return v && v.length === 3 && v.every((x) => !Number.isNaN(x)) ? [v[0], v[1], v[2]] : null
}

function FitView({ narrow }: { narrow: boolean }) {
  const map = useMap()
  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize()
      const at = urlAt()
      if (at) {
        map.setView([at[0], at[1]], at[2])
        return
      }
      map.fitBounds(VIEW_BOUNDS, narrow ? { paddingTopLeft: [8, 8], paddingBottomRight: [8, 150] } : { paddingTopLeft: [330, 64], paddingBottomRight: [440, 96] })
    }, 50)
    return () => window.clearTimeout(id)
  }, [map, narrow])
  return null
}

function FlyTo({ target }: { target: { at: [number, number]; key: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.flyTo(target.at, Math.max(map.getZoom(), 14), { animate: !reduce, duration: 0.8 })
  }, [map, target])
  return null
}

/**
 * Keep hover cards inside the visible map: below the status strip, above the
 * timeline and clear of the side panels (layers on the left, the board on the
 * right). Leaflet positions tooltips with a transform, so the nudge is a margin.
 */
function KeepCardsInView() {
  const map = useMap()
  useEffect(() => {
    let el: HTMLElement | null = null
    let raf = 0
    const fit = () => {
      if (!el) return
      el.style.marginTop = ''
      el.style.marginLeft = ''
      const r = el.getBoundingClientRect()
      const mapBox = map.getContainer().getBoundingClientRect()
      const strip = document.querySelector('.status-strip')?.getBoundingClientRect()
      const timeline = document.querySelector('.map-bottom')?.getBoundingClientRect()
      const top = Math.max(mapBox.top, strip ? strip.bottom : mapBox.top) + 8
      const bottom = Math.min(mapBox.bottom, timeline ? timeline.top : mapBox.bottom) - 8
      let d = 0
      // A card that opens above the cursor (transport) and has no room there flips below it, rather than being pushed down over it.
      const above = el.classList.contains('leaflet-tooltip-top')
      if (above && r.top < top && r.bottom + r.height + 20 <= bottom) d = r.height + 20
      else if (r.top < top) d = top - r.top
      else if (r.bottom > bottom) d = Math.max(top - r.top, bottom - r.bottom)
      if (d !== 0) el.style.marginTop = `${d}px`
      // Sideways: the visible part of the side panels (they're empty columns below their cards).
      const edge = (sel: string, side: 'right' | 'left') =>
        [...document.querySelectorAll<HTMLElement>(`${sel} > *`)]
          .map((x) => x.getBoundingClientRect())
          .filter((b) => b.width > 0 && b.height > 0 && b.bottom > r.top + d && b.top < r.bottom + d)
          .reduce<number | null>((a, b) => (a === null ? b[side] : side === 'right' ? Math.max(a, b.right) : Math.min(a, b.left)), null)
      const left = Math.max(mapBox.left, edge('.map-left', 'right') ?? mapBox.left) + 8
      const right = Math.min(mapBox.right, edge('.map-right', 'left') ?? mapBox.right) - 8
      let dx = 0
      if (r.width <= right - left) {
        if (r.left < left) dx = left - r.left
        else if (r.right > right) dx = right - r.right
      }
      if (dx !== 0) el.style.marginLeft = `${dx}px`
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(fit)
    }
    // React renders the card's content after Leaflet opens it, so refit when it resizes and shortly after.
    const ro = new ResizeObserver(schedule)
    const timers: number[] = []
    const open = (e: L.LeafletEvent) => {
      el = ((e as L.TooltipEvent).tooltip?.getElement() as HTMLElement | undefined) ?? null
      ro.disconnect()
      if (el) ro.observe(el)
      schedule()
      timers.push(window.setTimeout(fit, 60), window.setTimeout(fit, 200))
    }
    const close = () => {
      el = null
      ro.disconnect()
    }
    map.on('tooltipopen', open)
    map.on('tooltipclose', close)
    map.on('mousemove move zoomend', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      timers.forEach((x) => window.clearTimeout(x))
      map.off('tooltipopen', open)
      map.off('tooltipclose', close)
      map.off('mousemove move zoomend', schedule)
    }
  }, [map])
  return null
}

/** Stable empty list, so the vehicle canvas keeps its cache while the Train routes layer is off. */
const NO_RUNS: RailRun[] = []

const ESRI_ATTR = 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community · Labels &copy; Esri'

function Basemap({ id }: { id: BasemapId }) {
  if (id === 'dark') {
    // CARTO dark matter now returns "API key required" tiles without a key, so the dark
    // basemap is Esri's key-free Dark Gray Canvas (base + labels).
    return (
      <>
        <TileLayer
          key="dark"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          maxZoom={16}
        />
        <TileLayer key="dark-ref" url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
      </>
    )
  }
  if (id === 'streets') {
    return (
      <TileLayer
        key="streets"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
        className="tiles-streets"
      />
    )
  }
  return (
    <>
      <TileLayer key="img" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution={ESRI_ATTR} maxZoom={18} className="tiles-imagery" />
      <TileLayer key="roads" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxZoom={18} opacity={0.55} />
      {/* Place names only up to city zoom: beyond it Esri serves them stretched (a giant "Medina"). */}
      <TileLayer key="ref" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxZoom={14} />
    </>
  )
}

interface MapViewProps {
  registry: NodeRegistry | null
  dashboard: DashboardData | null
  economics: RegionalEconomics | null
  economicsError: Error | null
  live: LiveData | null
  liveError: Error | null
  routes: RoutesFile | null
  market: MarketVoiceData | null
  selectedId?: string
  onSelect: (id: string | undefined) => void
  onOpenNode: (id: string) => void
  /** Booked tour coaches from the operator console. */
  coaches?: CoachItem[]
  /** Madinah sites, walking reach and places for the Madinah layers. */
  extras?: MadinahExtras | null
  /** Prayer times (fractional hours) for a Riyadh date. */
  prayersOn?: (date: string) => number[]
  /** Prayer times as HH:MM for a Riyadh date (fajr, sunrise, dhuhr, asr, maghrib, isha). */
  prayerTimes?: (date: string) => Record<string, string> | null
}

export default function MapView({ registry, dashboard, economics, economicsError, live, liveError, routes, market, selectedId, onSelect, onOpenNode, coaches = [], extras = null, prayersOn, prayerTimes }: MapViewProps) {
  const { t: tr, lang } = useLang()
  const narrow = useIsNarrow()
  const [url] = useState(readUrlState)
  const [basemap, setBasemap] = useState<BasemapId>(url.base ?? 'hybrid')
  const [active, setActive] = useState<Set<LayerId>>(() => new Set(url.layers ?? readStoredLayers() ?? DEFAULT_LAYERS))
  const [showPrecip, setShowPrecip] = useState(true)
  const [tIdx, setT] = useState<number | null>(url.t)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [sheet, setSheet] = useState<'layers' | 'alerts' | 'nudges' | null>(null)
  const [rightTab, setRightTab] = useState<'board' | 'nudges'>(url.panel ?? 'board')
  const [showAllNudges, setShowAllNudges] = useState(false)
  const [activeNudge, setActiveNudge] = useState<string | undefined>(undefined)
  const [fly, setFly] = useState<{ at: [number, number]; key: number } | null>(null)

  const t = Math.max(0, Math.min((live?.hours ?? 1) - 1, tIdx ?? live?.now_index ?? live?.observed_until ?? 0))

  // A shared ?t=2026-10-02T14 is a Riyadh date and hour: once the timeline is known, turn it into
  // its index (ignored when that hour isn't in the timeline any more).
  const tAt = useRef(url.tAt)
  useEffect(() => {
    if (!tAt.current || !live) return
    const i = Math.round((Date.parse(`${tAt.current}:00:00+03:00`) - Date.parse(`${live.start}T00:00:00+03:00`)) / 3600000)
    tAt.current = null
    if (i >= 0 && i < live.hours) setT(i)
  }, [live])

  // The timeline follows the clock, so at midnight it starts a day later. A picked hour is an
  // index into it: shift it back by the same hours so it stays on the same date and hour.
  const prevStart = useRef(live?.start)
  useEffect(() => {
    const from = prevStart.current
    prevStart.current = live?.start
    if (!from || !live?.start || from === live.start) return
    const hours = Math.round((Date.parse(`${live.start}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 3600000)
    setT((cur) => (cur === null ? null : Math.max(0, cur - hours)))
  }, [live?.start])

  useEffect(() => {
    if (!playing || !live) return
    const id = window.setInterval(() => {
      setT((cur) => {
        const c = cur ?? live.now_index ?? live.observed_until
        return c + 1 >= live.hours ? 0 : c + 1
      })
    }, 900 / speed)
    return () => window.clearInterval(id)
  }, [playing, speed, live])

  // Saved only when the viewer toggles a layer: a ?layers= link or a picked
  // nudge turning a layer on doesn't replace the viewer's own choice.
  const toggle = (l: LayerId) => {
    const n = new Set(active)
    if (n.has(l)) n.delete(l)
    else {
      n.add(l)
      // Town-level layers draw cards on the towns: one at a time, so they don't pile up.
      for (const other of TOWN_LAYERS) if (other !== l && TOWN_LAYERS.includes(l)) n.delete(other)
    }
    setActive(n)
    storeLayers(n)
  }

  const allNodes = useMemo(() => buildMapNodes(registry, dashboard), [registry, dashboard])
  const nodes = useMemo(() => allNodes.filter((n) => n.prefecture === 'madinah'), [allNodes])
  const frame = useMemo(() => (live ? frameAt(live, t) : null), [live, t])
  const alerts = useMemo(() => (live && frame ? computeAlerts(live, routes, frame, registry?.nodes ?? [], t) : null), [live, routes, frame, registry, t])
  const top = alerts ? topAlert(alerts) : null
  const day = Math.floor(t / 24)
  // Optional: without hotel_thresholds.json loop #3 keeps its demo rule.
  const hotelThresholds = useJsonResource<HotelThresholds>('hotel_thresholds.json').data
  // Optional: public transport access (built daily by dhde-preprocessing-model). Without it the card and layer just don't show.
  // The Fukui "Getting here" card (transport.json in dhde-app's shape) has no Madinah file yet.
  const transport = null as TransportFile | null
  const transportMap = useJsonResource<TransportMapFile>('transport_map.json').data
  const transportOn = active.has('transport') || active.has('rail')
  const coachesOn = active.has('coaches') && coaches.length > 0
  // Bus trips (for moving buses and stop schedules) only load while the Bus routes layer is on.
  const trips = useJsonResource<TransportTripsFile>(active.has('transport') ? 'transport_trips.json' : null).data
  const railRuns = useMemo(() => buildRuns(transportMap?.rail), [transportMap])
  const nudges = useMemo(
    () => (live ? computeNudges(live, market, registry?.nodes ?? [], live.today_day ?? 0, hotelThresholds) : []),
    [live, market, registry, hotelThresholds],
  )
  const nudgesShown = useMemo(() => (showAllNudges ? nudges : topPerDay(nudges, 3)), [nudges, showAllNudges])
  const nudgesFrom = useMemo(() => nudgesShown.filter((n) => n.day >= day), [nudgesShown, day])
  const nudgesFromAll = useMemo(() => nudges.filter((n) => n.day >= day).length, [nudges, day])
  const pickNudge = (n: Nudge) => {
    setPlaying(false)
    setT(n.start)
    setActiveNudge(n.id)
    setFly({ at: n.focus, key: Date.now() })
    setActive((s) => (s.has('nudges') ? s : new Set([...s, 'nudges'])))
    if (narrow) setSheet(null)
  }
  const selected = allNodes.find((n) => n.id === selectedId)
  const hubNode = registry?.nodes.find((n) => n.id === 'haram')
  const hubName: [string, string] = hubNode ? [hubNode.name, hubNode.name_ja] : ['Masjid an-Nabawi', 'المسجد النبوي']
  const isDemo = Boolean(live?.demo)
  const observed = live ? t <= live.observed_until : true
  const layerOn = (l: LayerId) => active.has(l)
  const cardLayers = useMemo(
    () => ({ people: active.has('people'), weather: active.has('weather'), reviews: active.has('reviews'), survey: active.has('survey'), social: active.has('social') }),
    [active],
  )
  const paused = false

  const tabs = (
    <div className="panel-tabs" role="tablist" aria-label={tr('Right panel', 'اللوحة')}>
      <button role="tab" aria-selected={rightTab === 'board'} onClick={() => setRightTab('board')}>
        <Icon name="alert" size={14} /> {tr('Live board', 'اللوحة المباشرة')}
      </button>
      <button role="tab" aria-selected={rightTab === 'nudges'} onClick={() => setRightTab('nudges')}>
        <Icon name="flag" size={14} /> {tr('Action nudges', 'الإجراءات المقترحة')} <span className="count-badge">{nudgesFrom.length}</span>
      </button>
    </div>
  )
  const showNudges = narrow ? sheet === 'nudges' : rightTab === 'nudges'
  const nudgeTitle = (
    <h2 className="fp-title">
      <Icon name="flag" /> {tr('Action nudges', 'الإجراءات المقترحة')}
    </h2>
  )

  const rightPanel = selected ? (
    <NodeDrawer
      node={selected}
      frame={frame?.[selected.id]}
      live={live}
      routes={routes}
      transport={transport}
      hubName={hubName}
      dashboard={dashboard}
      economics={economics}
      market={market}
      t={t}
      onClose={() => onSelect(undefined)}
      onOpenNode={onOpenNode}
    />
  ) : showNudges && live ? (
    <NudgesPanel source={live?.sources?.nudges} nudges={nudgesFrom} total={nudgesFromAll} showAll={showAllNudges} setShowAll={setShowAllNudges} live={live} day={day} activeId={activeNudge} onPick={pickNudge} tabs={narrow ? nudgeTitle : tabs} onClose={narrow ? () => setSheet(null) : undefined} />
  ) : alerts ? (
    <AlertsPanel source={live?.sources?.people} alerts={alerts} nodes={nodes} frame={frame} isDemo={isDemo} onSelect={(id) => onSelect(id)} onClose={narrow ? () => setSheet(null) : undefined} tabs={narrow ? undefined : tabs} />
  ) : null

  const sheetState = narrow ? (selected ? 'right' : sheet === 'layers' ? 'left' : sheet === 'alerts' || sheet === 'nudges' ? 'right' : 'none') : 'none'

  return (
    <section className={`mapview sheet-${sheetState}`}>
      <MapContainer bounds={VIEW_BOUNDS} zoomSnap={0.25} zoomDelta={0.5} zoomControl={false} scrollWheelZoom className="map-canvas" preferCanvas={false} worldCopyJump={false}>
        <FitView narrow={narrow} />
        {!narrow && <ZoomControl position="bottomright" />}
        <Basemap id={basemap} />

        {live && frame && routes && (
          <>
            {layerOn('density') && <DensityLayer nodes={nodes} frame={frame} />}
            {layerOn('traffic') && <TrafficLayer live={live} routes={routes} t={t} paused={paused} />}
            {layerOn('trips') && <FlowLayer live={live} routes={routes} t={t} paused={paused} />}
            {layerOn('shade') && extras && <ShadeLayer extras={extras} frame={frame} date={live.days[day]?.date ?? live.start} hour={t % 24} />}
            {layerOn('flow') && extras && <CrowdLayer extras={extras} frame={frame} date={live.days[day]?.date ?? live.start} hour={t % 24} />}
            {layerOn('walk') && extras && <WalkLayer extras={extras} frame={frame} />}
            {layerOn('sentiment') && <SentimentLayer nodes={nodes} frame={frame} />}
          </>
        )}
        {layerOn('business') && extras && live && <BusinessLayer extras={extras} hour={t % 24} prayers={prayersOn?.(live.days[day]?.date ?? '') ?? []} />}
        {/* Clusters and site numbers are always shown: they are how operators and MRDA name the sites. */}
        {extras && <ClusterLayer extras={extras} onSelect={(id) => onSelect(id)} />}
        {market && layerOn('hotels') && <HotelsLayer data={market} day={day} nodes={registry?.nodes ?? []} />}
        {market && layerOn('rsi') && <RsiLayer data={market} />}
        {transportOn && transportMap && (
          <TransportLayer data={transportMap} bus={layerOn('transport')} rail={layerOn('rail')} trips={trips} runs={railRuns} />
        )}
        {(transportOn || coachesOn) && live && (
          <VehiclesLayer
            trips={layerOn('transport') ? trips : null}
            lines={transportMap?.lines ?? []}
            runs={layerOn('rail') ? railRuns : NO_RUNS}
            start={live.start}
            t={t}
            live={!playing && t === (live.now_index ?? live.observed_until)}
            playing={playing}
          />
        )}
        {coachesOn && <CoachesLayer items={coaches} />}
        {layerOn('economics') && economics && <EconomicsLayer economics={economics} nodes={allNodes} selectedId={selectedId} />}
        {layerOn('people') && (
          <PeopleLayer
            nodes={layerOn('people') ? nodes : []}
            frame={frame}
            selectedId={selectedId}
            onSelect={onSelect}
            meta={live?.node_meta}
            day={day}
          />
        )}
        {!layerOn('people') && <SiteMarkers nodes={nodes.filter((n) => n.priority)} selectedId={selectedId} onSelect={onSelect} />}
        {layerOn('weather') && frame && <WeatherLayer nodes={nodes} frame={frame} showPrecip={showPrecip} />}
        {/* One card per site: its name, then a row per active layer (weather, reviews, survey, posts). */}
        <SiteCards
          nodes={layerOn('people') ? nodes.filter((n) => frame?.[n.id]) : nodes.filter((n) => n.priority)}
          extra={nodes}
          frame={frame}
          market={market}
          layers={cardLayers}
          selectedId={selectedId}
          onSelect={onSelect}
          meta={live?.node_meta}
          day={day}
        />
        {layerOn('nudges') && <NudgeLayer nudges={nudgesShown} routes={routes} day={day} activeId={activeNudge} onPick={pickNudge} />}
        <VehicleHover />
        <FlyTo target={fly} />
        <KeepCardsInView />
        <Declutter />
      </MapContainer>

      <div className="map-ui">
        {live && (
          <div className="status-strip" role="status" aria-live="polite">
            <span className={`ss-tag ${observed ? 'live' : 'fc'}`}>{observed ? tr('LIVE', 'مباشر') : tr('FORECAST', 'توقع')}</span>
            <span className="ss-time">{timeLabel(live, t, lang)}</span>
            {top ? (
              <button
                className="ss-msg ss-ticker-btn"
                title={tr(top.en, top.ja)}
                onClick={() => {
                  setRightTab('nudges')
                  if (narrow) setSheet('nudges')
                }}
              >
                <span className={`ss-sev${top.sev === 'crit' ? ' blink' : ''}`} style={{ background: SEV_COLOUR[top.sev] }} aria-hidden="true"></span>
                <span className="ss-ticker">
                  {/* Long alerts scroll; the text is doubled so the loop is seamless. */}
                  {tr(top.en, top.ja).length > 64 ? (
                    <span className="ss-ticker-inner scroll" style={{ animationDuration: `${Math.max(14, tr(top.en, top.ja).length / 7)}s` }}>
                      <span>{tr(top.en, top.ja)}</span>
                      <span aria-hidden="true">{tr(top.en, top.ja)}</span>
                    </span>
                  ) : (
                    <span className="ss-ticker-inner">{tr(top.en, top.ja)}</span>
                  )}
                </span>
              </button>
            ) : (
              <span className="ss-msg">
                <span className="ss-sev" style={{ background: '#0ca30c' }} aria-hidden="true"></span>
                {tr('All conditions normal.', 'كل الظروف طبيعية.')}
              </span>
            )}
            {isDemo && (live?.sources && Object.values(live.sources).some((x) => x && x.status !== 'demo') ? <SourceBadge info={{ status: 'mixed', as_of: live.shared_date ?? null, real: [] }} note={OVERVIEW_NOTE} /> : <DemoBadge />)}
          </div>
        )}
        {liveError && <div className="banner banner-warn status-strip">live_demo.json: {liveError.message}</div>}

        <div className="map-left">
          <LayersPanel
            basemap={basemap}
            setBasemap={setBasemap}
            active={active}
            toggle={toggle}
            showPrecip={showPrecip}
            setShowPrecip={setShowPrecip}
            isDemo={isDemo}
            economics={economics}
            market={market}
            sources={live?.sources}
            economicsError={economicsError}
            onClose={narrow ? () => setSheet(null) : undefined}
          />
        </div>

        <div className="map-right">
          {live && !selected && !narrow && (
            <PrayerCard date={live.days[day]?.date ?? live.start} times={prayerTimes?.(live.days[day]?.date ?? live.start) ?? null} hour={t % 24} atNow={!playing && t === (live.now_index ?? live.observed_until)} />
          )}
          {rightPanel}
        </div>

        <div className="map-bottom">
          {live && (
            <Timeline
              live={live}
              t={t}
              setT={(i) => setT(i)}
              playing={playing}
              setPlaying={setPlaying}
              speed={speed}
              setSpeed={setSpeed}
              vehicles={transportOn || coachesOn}
              marks={live.days.flatMap((d, k) => {
                const pt = prayerTimes?.(d.date)
                if (!pt) return []
                return PRAYER_NAMES.filter((p) => p.id !== 'sunrise' && pt[p.id]).map((p) => ({
                  key: `${d.date}-${p.id}`,
                  i: k * 24 + Number(pt[p.id].slice(0, 2)) + Number(pt[p.id].slice(3, 5)) / 60,
                  label: `${tr(p.en, p.ar)} ${pt[p.id]}`,
                }))
              })}
            />
          )}
          {narrow && (
            <div className="sheet-tabs" role="group" aria-label={tr('Panels', 'اللوحات')}>
              <button className="btn" aria-pressed={sheetState === 'left'} onClick={() => { onSelect(undefined); setSheet(sheet === 'layers' ? null : 'layers') }}>
                <Icon name="layers" /> {tr('Layers', 'الطبقات')} <span className="count-badge">{active.size}</span>
              </button>
              <button className="btn" aria-pressed={sheet === 'alerts' && !selected} onClick={() => { onSelect(undefined); setSheet(sheet === 'alerts' ? null : 'alerts') }}>
                <Icon name="alert" /> {tr('Live', 'مباشر')}
                {alerts && alerts.traffic.length + alerts.weather.length + alerts.crowd.length > 0 && (
                  <span className="count-badge warn">{alerts.traffic.length + alerts.weather.length + alerts.crowd.length}</span>
                )}
              </button>
              <button className="btn" aria-pressed={sheet === 'nudges' && !selected} onClick={() => { onSelect(undefined); setSheet(sheet === 'nudges' ? null : 'nudges') }}>
                <Icon name="flag" /> {tr('Actions', 'الإجراءات')} <span className="count-badge">{nudgesFrom.length}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
