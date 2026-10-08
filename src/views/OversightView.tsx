import { useMemo } from 'react'
import type { AppData } from '../lib/data'
import { useJsonResource } from '../dhde/hooks/useJsonResource'
import type { NodeRegistry } from '../dhde/types/nodes'
import type { LiveData } from '../dhde/types/live'
import type { RoutesFile } from '../dhde/types/routes'
import type { MarketVoiceData } from '../dhde/types/market'
import DhdeMapView from '../dhde/views/map/MapView'
import type { CoachItem } from '../dhde/views/map/canvas/CoachCanvas'
import { allBookings, sitesFor, useOperatorState } from '../lib/operator'
import { useOperatorCtx } from './OperatorView'
import { clusterOf } from '../lib/sites'
import { go } from '../lib/route'
import { Loading } from '../components/ui'
import { useLang } from '../lib/i18n'
import { hhmmToHours, PRAYERS, prayersFor } from '../lib/data'
import type { MadinahExtras, SiteArea } from '../dhde/views/map/layers/MadinahLayers'
import type { Building } from '../dhde/lib/shade'
import type { Region } from '../dhde/views/map/layers/RegionLayer'
import { economyFacts } from '../dhde/views/map/layers/MadinahLayers'
import { economyFactsStore } from '../dhde/views/map/layers/economyStore'

/**
 * The oversight map: the DHDE map (same UI as dhde-app) on Madinah data, with every
 * operator's booked coaches on it. MRDA sees all operators, flows, transport and nudges in
 * one place; operators book and sign off in the Operator view.
 */
export default function OversightView({ data, selected }: { data: AppData; selected: string | null }) {
  const { t } = useLang()
  const registry = useJsonResource<NodeRegistry>('nodes.json')
  const live = useJsonResource<LiveData>('live_demo.json')
  const routes = useJsonResource<RoutesFile>('routes.json')
  const market = useJsonResource<MarketVoiceData>('market_voice_demo.json')
  const areas = useJsonResource<{ sites: Record<string, SiteArea> }>('site_areas.json')
  const buildings = useJsonResource<{ sites: Record<string, Building[]> }>('buildings.json')
  const legs = useJsonResource<{ legs: Record<string, { path: [number, number][] }> }>('coach_legs.json')
  const regions = useJsonResource<{ regions: Region[] }>('regions.json')
  const ctx = useOperatorCtx(data)
  const st = useOperatorState()

  const coaches = useMemo<CoachItem[]>(() => {
    if (!ctx || !live.data) return []
    const dates = live.data.days.map((d) => d.date)
    return allBookings(ctx, st, dates).map((b) => {
      const first = ctx.byId[sitesFor(ctx, b.value)[0]]
      const colour = b.value === 'route:ALL' ? '#c99a3b' : first ? clusterOf(first).colour : '#199e70'
      const origin = ctx.origins.find((o) => o.id === b.origin)
      return { b, colour, siteName: (id: string) => ctx.byId[id]?.short ?? id, originName: origin?.label ?? b.origin }
    })
  }, [ctx, st, live.data])

  const extras = useMemo<MadinahExtras | null>(
    () =>
      data.sites
        ? { sites: data.sites.sites, isochrones: data.isochrones, pois: data.pois, areas: areas.data?.sites ?? null, buildings: buildings.data?.sites ?? null, legs: legs.data?.legs ?? null, origins: data.sites.origins, telecom: data.telecom, spend: data.spend, context: data.context }
        : null,
    [data.sites, data.isochrones, data.pois, areas.data, buildings.data, legs.data, data.telecom, data.spend, data.context],
  )
  economyFactsStore.set(economyFacts(extras))
  const prayersOn = (date: string) => {
    const p = prayersFor(data, date)
    return p ? PRAYERS.map((x) => hhmmToHours(p[x.id])) : []
  }

  if (live.isLoading || registry.isLoading) return <Loading what={t('Loading the oversight map…', 'جارٍ تحميل خريطة الإشراف…')} />

  return (
    <DhdeMapView
      registry={registry.data}
      dashboard={null}
      economics={null}
      economicsError={null}
      live={live.data}
      liveError={live.error}
      routes={routes.data}
      market={market.data}
      selectedId={selected ?? undefined}
      onSelect={(id) => go('map', id ?? null)}
      onOpenNode={(id) => go('sites', id)}
      coaches={coaches}
      extras={extras}
      prayersOn={prayersOn}
      prayerTimes={(date) => prayersFor(data, date)}
      regions={regions.data?.regions ?? []}
    />
  )
}
