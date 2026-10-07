import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { hitAt } from '../canvas/hits'

const ICON: Record<string, string> = { bus: '🚌', coach: '🚐', train: '🚄' }

/** Hover (or tap) a moving bus, coach or train for its card: line or operator, next stop and time. */
export function VehicleHover() {
  const map = useMap()
  useEffect(() => {
    const tip = L.tooltip({ direction: 'top', offset: [0, -10], className: 'map-tip vehicle-tip', opacity: 1 })
    let shown = false
    const show = (e: L.LeafletMouseEvent) => {
      const h = hitAt(e.containerPoint.x, e.containerPoint.y)
      if (!h) {
        if (shown) {
          map.closeTooltip(tip)
          shown = false
        }
        map.getContainer().style.cursor = ''
        return
      }
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      tip.setLatLng(map.containerPointToLatLng([h.x, h.y])).setContent(
        `<strong>${ICON[h.kind] ?? ''} ${esc(h.title)}</strong>${h.lines.map((l) => `<div class="tip-row">${esc(l)}</div>`).join('')}`,
      )
      if (!shown) {
        tip.openOn(map)
        shown = true
      }
      map.getContainer().style.cursor = 'pointer'
    }
    map.on('mousemove', show)
    map.on('click', show)
    return () => {
      map.off('mousemove', show)
      map.off('click', show)
      map.closeTooltip(tip)
    }
  }, [map])
  return null
}
