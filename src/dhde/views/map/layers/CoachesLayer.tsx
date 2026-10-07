import { useEffect } from 'react'
import { CoachCanvas } from '../canvas/CoachCanvas'
import type { CoachItem } from '../canvas/CoachCanvas'
import { useLeafletLayer } from '../canvas/useLeafletLayer'

/** Booked tour coaches moving on the shared vehicle clock (VehiclesLayer sets it). */
export function CoachesLayer({ items }: { items: CoachItem[] }) {
  const canvas = useLeafletLayer(() => new CoachCanvas())
  useEffect(() => {
    canvas.setData(items)
  }, [canvas, items])
  return null
}
