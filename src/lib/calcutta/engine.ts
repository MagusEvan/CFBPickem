/**
 * Sport-agnostic Calcutta auction engine.
 *
 * Operates on generic items ({ id, name, odds }) so it can be reused for
 * other sports later — nothing golf-specific lives here. Odds are American
 * (+450, +20000); higher = longer shot. Lots are auctioned in reverse odds
 * order: longshots first, the favorite last.
 */

export interface CalcuttaItem {
  id: string
  name: string
  /** American odds to win; null = unknown (treated as the longest shot) */
  odds: number | null
}

export interface LotDescriptor {
  kind: 'golfer' | 'scraps'
  label: string
  itemIds: string[]
}

export interface ScrapsConfig {
  enabled: boolean
  /** Items with odds strictly worse (higher) than this go to scraps */
  thresholdOdds: number
  packages: number
  split: 'snake_by_odds' | 'random' | 'curated'
}

/** Worst odds first, favorite last. Null odds are treated as the longest shots. */
export function orderByReverseOdds<T extends { odds: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.odds ?? Infinity) - (a.odds ?? Infinity))
}

/**
 * Build the ordered lot list: scraps packages first (longest shots), then
 * individual items from worst odds to best. Curated split produces empty
 * packages for the admin to fill.
 */
export function buildLots(items: CalcuttaItem[], scraps: ScrapsConfig): LotDescriptor[] {
  let scrapsItems: CalcuttaItem[] = []
  let mainItems = items
  if (scraps.enabled) {
    scrapsItems = items.filter((i) => i.odds === null || i.odds > scraps.thresholdOdds)
    mainItems = items.filter((i) => i.odds !== null && i.odds <= scraps.thresholdOdds)
  }

  const lots: LotDescriptor[] = []

  if (scraps.enabled && scraps.packages > 0 && (scrapsItems.length > 0 || scraps.split === 'curated')) {
    const packages: CalcuttaItem[][] = Array.from({ length: scraps.packages }, () => [])
    if (scraps.split !== 'curated') {
      const pool =
        scraps.split === 'random' ? shuffle(scrapsItems) : orderByReverseOdds(scrapsItems)
      // Snake distribution so package quality stays balanced
      pool.forEach((item, i) => {
        const cycle = Math.floor(i / scraps.packages)
        const pos = i % scraps.packages
        const idx = cycle % 2 === 0 ? pos : scraps.packages - 1 - pos
        packages[idx].push(item)
      })
    }
    packages.forEach((pkg, i) => {
      lots.push({
        kind: 'scraps',
        label: `Scraps Package ${i + 1}`,
        itemIds: pkg.map((p) => p.id),
      })
    })
  }

  for (const item of orderByReverseOdds(mainItems)) {
    lots.push({ kind: 'golfer', label: item.name, itemIds: [item.id] })
  }

  return lots
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Validate a bid; returns an error message or null if acceptable. */
export function validateBid(args: {
  currentHigh: number | null
  amount: number
  minOpening: number
  minRaise: number
}): string | null {
  const { currentHigh, amount, minOpening, minRaise } = args
  if (!Number.isFinite(amount) || amount <= 0) return 'Bid must be a positive amount'
  if (currentHigh === null) {
    if (amount < minOpening) return `Opening bid must be at least ${minOpening}`
    return null
  }
  if (amount < currentHigh + minRaise) {
    return `Bid must be at least ${currentHigh + minRaise}`
  }
  return null
}

export type NextLotResult =
  | { action: 'open'; lotId: string }
  | { action: 'recycle' } // unsold lots remain; flip them to pending and go again
  | { action: 'complete' }

/**
 * Determine what happens after the current lot closes. Lots must be sorted
 * by lot_order. Pending lots are auctioned in order; once exhausted, unsold
 * lots are recycled for another pass; when everything is sold, it's over.
 */
export function nextLot(
  lots: Array<{ id: string; status: 'pending' | 'open' | 'sold' | 'unsold' }>
): NextLotResult {
  const pending = lots.find((l) => l.status === 'pending')
  if (pending) return { action: 'open', lotId: pending.id }
  if (lots.some((l) => l.status === 'unsold')) return { action: 'recycle' }
  return { action: 'complete' }
}

export interface CalcuttaFinisher {
  itemId: string
  /** Numeric finish position (1 = winner); tied finishers share the same position */
  position: number
  /** How many finishers are tied at this position (1 = no tie) */
  tiedCount: number
}

/**
 * Pot payouts by finish position with tie-splitting.
 *
 * k finishers tied at position p split the combined payout of positions
 * p..p+k-1 evenly. Positions beyond the defined tiers pay nothing, so a tie
 * spanning past the last paying position splits only the defined tiers'
 * money — the pot always pays out exactly 100% when all tier positions are
 * occupied.
 *
 * Returns dollars per itemId.
 */
export function computeCalcuttaPayouts(
  pot: number,
  tiers: Array<{ position: number; pct: number }>,
  finishers: CalcuttaFinisher[]
): Map<string, number> {
  const pctByPosition = new Map(tiers.map((t) => [t.position, t.pct]))
  const payouts = new Map<string, number>()
  for (const f of finishers) {
    let combinedPct = 0
    for (let p = f.position; p < f.position + f.tiedCount; p++) {
      combinedPct += pctByPosition.get(p) ?? 0
    }
    const sharePct = combinedPct / f.tiedCount
    payouts.set(f.itemId, (pot * sharePct) / 100)
  }
  return payouts
}

export interface LedgerRow {
  ownerId: string
  spent: number
  won: number
  net: number
}

/** Per-owner money summary. Package owners collect all package items' payouts. */
export function buildLedger(
  soldLots: Array<{ winnerId: string; price: number; itemIds: string[] }>,
  payoutByItemId: Map<string, number>
): Map<string, LedgerRow> {
  const ledger = new Map<string, LedgerRow>()
  for (const lot of soldLots) {
    const row = ledger.get(lot.winnerId) ?? { ownerId: lot.winnerId, spent: 0, won: 0, net: 0 }
    row.spent += lot.price
    for (const id of lot.itemIds) row.won += payoutByItemId.get(id) ?? 0
    ledger.set(lot.winnerId, row)
  }
  for (const row of ledger.values()) row.net = row.won - row.spent
  return ledger
}
