export type ViewId = 'summary' | 'map' | 'heat' | 'operator' | 'sites' | 'networks' | 'strategy' | 'data' | 'verify'

export const VIEW_IDS: ViewId[] = ['summary', 'map', 'heat', 'operator', 'sites', 'networks', 'strategy', 'data', 'verify']

export interface Route {
  view: ViewId
  site: string | null
}

export function parseHash(): Route {
  const [view, site] = window.location.hash.replace(/^#\/?/, '').split('/')
  // no route: open on the map, which starts on the whole Kingdom
  const v = VIEW_IDS.includes(view as ViewId) ? (view as ViewId) : 'map'
  return { view: v, site: site ? decodeURIComponent(site) : null }
}

export function go(view: ViewId, site?: string | null) {
  window.location.hash = `#/${view}${site ? '/' + encodeURIComponent(site) : ''}`
}
