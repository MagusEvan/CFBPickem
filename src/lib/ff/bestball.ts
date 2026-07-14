// Best ball optimal-lineup math. Pure — no I/O.
//
// Greedy fill is provably optimal here because every FLEX slot shares ONE
// eligibility set (superflex is just QB ∈ flexEligible, not a distinct slot
// type): taking the top-k players per dedicated position never hurts FLEX,
// since any eligible player displaced from a dedicated slot by a higher
// scorer is still available to FLEX. Revisit if slot types with differing
// eligibility sets are ever introduced.

import { computeFantasyPoints, round2 } from './scoring'
import type { FFBestBallSettings, FFPosition, FFScoringSettings, FFStatLine } from './types'

export interface BestBallSlot {
  slot: FFPosition | 'FLEX'
  slot_index: number
  /** null when the roster can't fill the slot */
  player_id: string | null
  points: number
}

export interface BestBallLineup {
  slots: BestBallSlot[]
  total: number
  /** Every rostered player's points this week (starters and unused alike) */
  pointsByPlayer: Map<string, number>
  /** Player ids that made the optimal lineup */
  starterIds: Set<string>
}

const DEDICATED: FFPosition[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']

/**
 * Retroactive optimal lineup for one member-week: score every rostered
 * player (missing stats = 0), fill each dedicated slot with the top scorers
 * of that position, then FLEX with the best remaining flex-eligible players.
 * Deterministic: ties break by player id.
 */
export function optimalLineup(
  players: Array<{ id: string; position: FFPosition }>,
  statsByPlayer: Record<string, FFStatLine>,
  scoring: FFScoringSettings,
  bb: Pick<FFBestBallSettings, 'roster' | 'flexEligible'>
): BestBallLineup {
  const pointsByPlayer = new Map<string, number>()
  for (const p of players) {
    const stats = statsByPlayer[p.id]
    pointsByPlayer.set(p.id, stats ? computeFantasyPoints(stats, scoring) : 0)
  }

  const byPosition = new Map<FFPosition, Array<{ id: string; position: FFPosition }>>()
  for (const p of players) {
    const list = byPosition.get(p.position) ?? []
    list.push(p)
    byPosition.set(p.position, list)
  }
  for (const list of byPosition.values()) {
    list.sort(
      (a, b) =>
        pointsByPlayer.get(b.id)! - pointsByPlayer.get(a.id)! || a.id.localeCompare(b.id)
    )
  }

  const slots: BestBallSlot[] = []
  const starterIds = new Set<string>()

  for (const pos of DEDICATED) {
    const ranked = byPosition.get(pos) ?? []
    for (let i = 0; i < bb.roster[pos]; i++) {
      const player = ranked[i]
      slots.push({
        slot: pos,
        slot_index: i,
        player_id: player?.id ?? null,
        points: player ? pointsByPlayer.get(player.id)! : 0,
      })
      if (player) starterIds.add(player.id)
    }
  }

  const flexPool = players
    .filter(
      (p) =>
        !starterIds.has(p.id) &&
        (bb.flexEligible as readonly string[]).includes(p.position)
    )
    .sort(
      (a, b) =>
        pointsByPlayer.get(b.id)! - pointsByPlayer.get(a.id)! || a.id.localeCompare(b.id)
    )
  for (let i = 0; i < bb.roster.FLEX; i++) {
    const player = flexPool[i]
    slots.push({
      slot: 'FLEX',
      slot_index: i,
      player_id: player?.id ?? null,
      points: player ? pointsByPlayer.get(player.id)! : 0,
    })
    if (player) starterIds.add(player.id)
  }

  return {
    slots,
    total: round2(slots.reduce((sum, s) => sum + s.points, 0)),
    pointsByPlayer,
    starterIds,
  }
}
