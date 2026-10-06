/**
 * Icon drawings (24px grid, currentColor). Kept as strings as well so map
 * DivIcons (plain HTML) can use the same drawings.
 */

export const ICON_PATHS = {
  home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  nodes: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  strategy: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.6.8 2.7 2.6 3 5.2"/>',
  flow: '<path d="M3 8h13l-3-3M21 16H8l3 3"/>',
  traffic: '<rect x="5" y="3" width="14" height="18" rx="4"/><circle cx="12" cy="8" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="16" r="1.6"/>',
  weather: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18Z"/>',
  sentiment: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2M9 9.5h.01M15 9.5h.01"/>',
  economics: '<path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 1.6 2.6 4.5 3.2 4.5 1.5 4.5 3.3-2 3-4.5 3-4.5-1.3-4.5-3"/>',
  density: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5" opacity=".6"/><circle cx="12" cy="12" r="9.5" opacity=".3"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
  now: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  lab: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3"/>',
  umbrella: '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/>',
  basemap: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 15l5-5 4 4 3-3 6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  survey: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM8.5 12l1.5 1.5 3-3M8.5 17h7"/>',
  social: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12M9 17l-2 4M15 17l2 4"/><circle cx="9.5" cy="13.5" r=".8"/><circle cx="14.5" cy="13.5" r=".8"/>',
  bus: '<rect x="5" y="3.5" width="14" height="14" rx="2.5"/><path d="M5 11h14M8 17.5v2.5M16 17.5v2.5"/><circle cx="8.5" cy="14.3" r=".8"/><circle cx="15.5" cy="14.3" r=".8"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 15.8a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/>',
  network: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.3 7.2 10.5 16M16.7 7.2 13.5 16M7.5 6h9"/>',
  mosque: '<path d="M12 3c-3 2.5-5 4.5-5 7h10c0-2.5-2-4.5-5-7Z"/><path d="M5 21V12h14v9M3 21h18M10 21v-4a2 2 0 0 1 4 0v4M20.5 6v15"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6 3 3V21M8 11l2.5-3.5 3.5 1 2 3.5 2.5 1M11.5 15l1-6.5"/>',
  parking: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"/>',
  shade: '<path d="M3 11a9 9 0 0 1 18 0H3Z"/><path d="M12 11v10M8 21h8"/>',
  spend: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  data: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
} as const

export type IconName = keyof typeof ICON_PATHS

export function iconSvg(name: IconName, size = 14): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`
}
