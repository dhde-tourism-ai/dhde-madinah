/** Shapes of the files in public/data. Real files carry status "real"; telecom_demo.json is illustrative. */

export type LatLon = [number, number]
export type Provenance = 'real' | 'modelled' | 'illustrative' | 'pending' | 'reported'

export interface Site {
  id: string
  num: number
  name: string
  name_ar: string
  short: string
  short_ar: string
  cluster: string
  lat: number
  lon: number
  desc: string
  desc_ar: string
  photo: { url: string; credit: string } | null
  typical_visit_min: number
  coord_source: 'osm' | 'prototype'
  pilot_phase: number | null
  open_air: boolean
}

export interface SitesFile {
  source: string
  sites: Site[]
  origins: { id: string; label: string; label_ar: string; lat: number; lon: number }[]
}

export interface DwellHistBin {
  upto_min: number | null
  share: number
}

export interface TelecomSite {
  daily_devices: number[]
  hourly: (number | null)[]
  dwell: { median_min: number; p25_min: number; p75_min: number; hist: DwellHistBin[] }
  nationality_mix: { group: string; share: number }[]
  visitor_type: { international: number }
  second_site_share: number
  spend_sar_day: Record<string, number>
  spend_sar_hourly_share: number[]
}

export interface TelecomFile {
  demo: boolean
  status: Provenance
  note: string
  generated_at: string
  start: string
  hours: number
  k_min: number
  days: { date: string; dow: string; weekend: boolean; prayers: Record<string, string> }[]
  sites: Record<string, TelecomSite>
  od: { from: string; to: string; trips_day: number; km: number }[]
  groups: { id: string; label: string; label_ar: string; share: number; stay_days: number }[]
  segments: { id: string; label: string; label_ar: string; share: number; sites_per_day: number; dwell_mult: number; spend_sar_day: number }[]
  spend_categories: { id: string; label: string; label_ar: string }[]
  users: { id: string; segment: string; group: string; stay_days: number; visits: { site: string; order: number; dwell_min: number; spend_sar: number }[] }[]
  wifi_zones: { id: string; site: string; label: string; lat: number; lon: number }[]
}

export interface TransportFile {
  source: string
  fetched_at: string
  note?: string
  bus_routes: { id: string; ref?: string; name?: string; name_ar?: string; operator?: string; colour?: string; path: LatLon[][] }[]
  bus_stops: { id: string; name?: string; name_ar?: string; lat: number; lon: number }[]
  rail: { id: string; name?: string; kind: string; path: LatLon[][] }[]
  stations: { id: string; name?: string; name_ar?: string; kind: string; lat: number; lon: number }[]
  parking: { id: string; name?: string; lat: number; lon: number; capacity: number | null; kind: string | null; polygon: LatLon[] | null }[]
}

export interface PoisFile {
  source: string
  fetched_at: string
  points: { lat: number; lon: number; cat: string; name?: string }[]
  by_site: Record<string, Record<string, number>>
}

export interface IsochronesFile {
  source: string
  fetched_at: string
  minutes: number[]
  speed_kmh: number
  sites: Record<string, Record<string, LatLon[]> & { reach_m2?: Record<string, number> }>
}

export interface RoadsFile {
  source: string
  fetched_at: string
  roads: { id: string; name?: string; name_ar?: string; class: string; path: LatLon[] }[]
}

export interface SpendFile {
  source: string | string[]
  fetched_at: string
  /** partial = compiled from press reports, some weeks missing */
  status: Provenance | 'partial'
  note?: string
  city: string
  weeks: { week_end: string; transactions: number; value_sar: number }[]
  sectors: { sector: string; value_sar: number; transactions?: number; scope: string; period: string }[]
}

export interface ContextFile {
  facts: { id: string; label: string; value: number | string; unit?: string; period?: string; source_name: string; url: string; status: Provenance }[]
}

export interface PrayerFile {
  method: string
  days: Record<string, Record<string, string>>
}
