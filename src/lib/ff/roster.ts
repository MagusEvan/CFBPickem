// Pure roster/lineup helpers: slot layout from league settings, position
// eligibility, and greedy lineup auto-fill (used at draft completion).

import type { FFLeagueSettings, FFPosition, FFSlot } from './types'

export interface SlotDef {
  slot: FFSlot
  slot_index: number
}

const STARTER_ORDER: FFSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST']

/** Ordered slot list for a lineup (starters, then bench, then IR). */
export function slotsForSettings(settings: FFLeagueSettings): SlotDef[] {
  const slots: SlotDef[] = []
  for (const slot of [...STARTER_ORDER, 'BENCH', 'IR'] as FFSlot[]) {
    const count = settings.roster[slot as keyof FFLeagueSettings['roster']]
    for (let i = 0; i < count; i++) slots.push({ slot, slot_index: i })
  }
  return slots
}

/** Which positions may occupy a slot. */
export function eligiblePositionsForSlot(
  slot: FFSlot,
  settings: FFLeagueSettings
): FFPosition[] {
  if (slot === 'FLEX') return settings.flexEligible
  if (slot === 'BENCH' || slot === 'IR') return ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
  return [slot]
}

const SLOT_SORT: Record<FFSlot, number> = {
  QB: 0, RB: 1, WR: 2, TE: 3, FLEX: 4, K: 5, DST: 6, BENCH: 7, IR: 8,
}

/** Stable display order: starters (QB→DST), then bench, then IR. */
export function sortSlots<T extends { slot: FFSlot; slot_index: number }>(slots: T[]): T[] {
  return [...slots].sort(
    (a, b) => SLOT_SORT[a.slot] - SLOT_SORT[b.slot] || a.slot_index - b.slot_index
  )
}

/**
 * A player locks when their NFL team's game for the week has kicked off.
 * Players with no team or no game that week (bye) never lock.
 */
export function isPlayerLocked(
  player: { nfl_team_id: string | null },
  weekGameStartByTeamId: Map<string, string>,
  now: number = Date.now()
): boolean {
  if (!player.nfl_team_id) return false
  const startTime = weekGameStartByTeamId.get(player.nfl_team_id)
  if (!startTime) return false
  return new Date(startTime).getTime() <= now
}

/**
 * Greedy lineup auto-fill: dedicated starting slots get the best-ranked
 * player of that position, FLEX gets the best remaining flex-eligible
 * player, everyone else goes to the bench (IR left empty).
 *
 * `players` must be sorted best-first (e.g. by default_rank).
 */
export function autoFillLineup(
  players: Array<{ id: string; position: FFPosition }>,
  settings: FFLeagueSettings
): Array<SlotDef & { player_id: string | null }> {
  const remaining = [...players]
  const assignments: Array<SlotDef & { player_id: string | null }> = []

  const takeFirst = (eligible: FFPosition[]): string | null => {
    const idx = remaining.findIndex((p) => eligible.includes(p.position))
    if (idx < 0) return null
    return remaining.splice(idx, 1)[0].id
  }

  for (const def of slotsForSettings(settings)) {
    if (def.slot === 'IR') {
      assignments.push({ ...def, player_id: null })
      continue
    }
    const eligible =
      def.slot === 'BENCH'
        ? (['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as FFPosition[])
        : eligiblePositionsForSlot(def.slot, settings)
    assignments.push({ ...def, player_id: takeFirst(eligible) })
  }

  return assignments
}
