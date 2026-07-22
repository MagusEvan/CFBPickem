export type CalcuttaMode = 'live' | 'admin_entry'
export type ScrapsSplit = 'snake_by_odds' | 'random' | 'curated'

export interface CalcuttaPayoutTier {
  /** Finish position this tier pays (1 = winner) */
  position: number
  /** Percentage of the pot (all tiers must sum to 100) */
  pct: number
}

export interface CalcuttaSettings {
  mode: CalcuttaMode
  minOpeningBid: number
  minRaise: number
  /** Live-mode countdown; resets on each bid */
  timerSeconds: number
  scraps: {
    enabled: boolean
    /** American odds; golfers with odds worse (higher) than this go to scraps */
    thresholdOdds: number
    /** Number of scraps packages */
    packages: number
    split: ScrapsSplit
  }
  payoutTiers: CalcuttaPayoutTier[]
}

export const DEFAULT_CALCUTTA_SETTINGS: CalcuttaSettings = {
  mode: 'live',
  minOpeningBid: 1,
  minRaise: 1,
  timerSeconds: 15,
  scraps: {
    enabled: true,
    thresholdOdds: 20000,
    packages: 4,
    split: 'snake_by_odds',
  },
  payoutTiers: [
    { position: 1, pct: 40 },
    { position: 2, pct: 20 },
    { position: 3, pct: 15 },
    { position: 4, pct: 10 },
    { position: 5, pct: 8 },
    { position: 6, pct: 4 },
    { position: 7, pct: 3 },
  ],
}

/** Validate settings; returns an error message or null */
export function validateCalcuttaSettings(s: CalcuttaSettings): string | null {
  if (s.minOpeningBid < 0) return 'Minimum opening bid cannot be negative'
  if (s.minRaise < 1) return 'Minimum raise must be at least 1'
  if (s.timerSeconds < 5 || s.timerSeconds > 300) return 'Timer must be 5–300 seconds'
  if (s.scraps.enabled) {
    if (s.scraps.packages < 1) return 'Scraps packages must be at least 1'
    if (s.scraps.thresholdOdds < 0) return 'Scraps odds threshold must be positive'
  }
  if (s.payoutTiers.length === 0) return 'At least one payout tier is required'
  const positions = new Set<number>()
  for (const t of s.payoutTiers) {
    if (t.position < 1) return 'Payout positions must be 1 or greater'
    if (t.pct <= 0) return 'Payout percentages must be positive'
    if (positions.has(t.position)) return `Duplicate payout position ${t.position}`
    positions.add(t.position)
  }
  const total = s.payoutTiers.reduce((sum, t) => sum + t.pct, 0)
  if (Math.abs(total - 100) > 0.001) return `Payout percentages must total 100 (currently ${total})`
  return null
}
