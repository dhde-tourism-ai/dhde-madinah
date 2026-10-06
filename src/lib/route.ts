export type ViewId = 'summary' | 'map' | 'sites' | 'networks' | 'strategy' | 'data'

export const VIEW_IDS: ViewId[] = ['summary', 'map', 'sites', 'networks', 'strategy', 'data']

export interface Route {
  view: ViewId
  site: string | null
}

export function parseHash(): Route {
  const [view, site] = window.location.hash.replace(/^#\/?/, '').split('/')
  const v = VIEW_IDS.includes(view as ViewId) ? (view as ViewId) : 'summary'
  return { view: v, site: site ? decodeURIComponent(site) : null }
}

export function go(view: ViewId, site?: string | null) {
  window.location.hash = `#/${view}${site ? '/' + encodeURIComponent(site) : ''}`
}
