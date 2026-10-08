/** The real city spending figures for the economy legend, set by the Oversight view. */
export interface EconomyFacts {
  week: { end: string; value: number; change: number | null } | null
  perNight: number | string | null
  perTrip: number | string | null
  total: number | string | null
}

let facts: EconomyFacts = { week: null, perNight: null, perTrip: null, total: null }

export const economyFactsStore = {
  get: () => facts,
  set: (f: EconomyFacts) => {
    facts = f
  },
}
