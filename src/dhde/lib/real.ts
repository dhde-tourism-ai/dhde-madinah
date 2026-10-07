/** The Fukui merge layer (real_data.json) is not used for Madinah; only the measure labels remain. */
const MEASURE_LABEL: Record<string, string> = {
  people: 'telecom device counts (demo)',
  telecom: 'telecom device counts',
  camera: 'camera detections',
  vehicles: 'vehicle counts',
  reservations: 'coach bookings',
  proxy: 'estimate',
}

export function measureLabel(m: string | null): string {
  return m ? (MEASURE_LABEL[m] ?? m) : 'no signal'
}
