// Pure snake-draft logic: pick validation and timer autopick selection.
// The snake order itself reuses generateSnakeOrder from the shared engine.

import type { FFLeagueSettings, FFPlayer, FFPosition } from './types'
import { totalRosterSpots } from './settings'

export { generateSnakeOrder, getPickInfo } from '@/lib/draft/engine'

/** Snake rounds = draftable roster spots (IR is not drafted). */
export function draftRounds(settings: FFLeagueSettings): number {
  return totalRosterSpots(settings)
}

export function validateFfPick(params: {
  currentMemberId: string | null
  requestingMemberId: string
  playerId: string
  draftedPlayerIds: Set<string>
}): { valid: true } | { valid: false; error: string } {
  if (params.currentMemberId !== params.requestingMemberId) {
    return { valid: false, error: 'It is not your turn to pick.' }
  }
  if (params.draftedPlayerIds.has(params.playerId)) {
    return { valid: false, error: 'This player has already been drafted.' }
  }
  return { valid: true }
}

const STARTER_POSITIONS: FFPosition[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']

/**
 * Timer autopick: best available by default_rank, except when the member's
 * remaining picks are only just enough to satisfy unfilled starting slots —
 * then restrict to those needed positions (guarantees a legal starting
 * lineup, e.g. K/DST get drafted by the end).
 *
 * `available` must be sorted best-first and contain only undrafted players.
 */
export function autopickPlayer(
  available: FFPlayer[],
  memberPositions: FFPosition[],
  remainingPicks: number,
  settings: FFLeagueSettings
): FFPlayer | null {
  if (available.length === 0) return null

  const counts: Record<FFPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 }
  for (const pos of memberPositions) counts[pos]++

  const deficits: Partial<Record<FFPosition, number>> = {}
  let neededCount = 0
  for (const pos of STARTER_POSITIONS) {
    const deficit = Math.max(0, settings.roster[pos] - counts[pos])
    if (deficit > 0) {
      deficits[pos] = deficit
      neededCount += deficit
    }
  }
  // FLEX need is covered by surplus at any flex-eligible position
  const flexSurplus = settings.flexEligible.reduce(
    (sum, pos) => sum + Math.max(0, counts[pos] - settings.roster[pos]),
    0
  )
  const flexDeficit = Math.max(0, settings.roster.FLEX - flexSurplus)
  neededCount += flexDeficit

  if (remainingPicks <= neededCount) {
    const neededPositions = new Set<FFPosition>(Object.keys(deficits) as FFPosition[])
    if (flexDeficit > 0) settings.flexEligible.forEach((p) => neededPositions.add(p))
    const constrained = available.find((p) => neededPositions.has(p.position))
    if (constrained) return constrained
  }

  return available[0]
}
