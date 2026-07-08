// Pure fantasy scoring: raw stat lines × league scoring settings.
// Computed on-read everywhere (no stored points), so scoring-setting changes
// re-score history by design.

import type { FFStatLine, FFScoringSettings, FFLineupSlot } from './types'

function perYard(yards: number, ydsPerPoint: number): number {
  return ydsPerPoint > 0 ? yards / ydsPerPoint : 0
}

/** Points-allowed tier lookup: first tier (ordered ascending) whose max >= pa. */
function pointsAllowedScore(pa: number, tiers: FFScoringSettings['dst']['pointsAllowedTiers']): number {
  for (const tier of tiers) {
    if (tier.max === null || pa <= tier.max) return tier.points
  }
  return 0
}

export function computeFantasyPoints(stats: FFStatLine, s: FFScoringSettings): number {
  let pts = 0

  pts += perYard(stats.pass_yd ?? 0, s.passYdsPerPoint)
  pts += (stats.pass_td ?? 0) * s.passTd
  pts += (stats.pass_int ?? 0) * s.passInt
  pts += (stats.pass_2pt ?? 0) * s.pass2pt

  pts += perYard(stats.rush_yd ?? 0, s.rushYdsPerPoint)
  pts += (stats.rush_td ?? 0) * s.rushTd
  pts += (stats.rush_2pt ?? 0) * s.rush2pt

  pts += (stats.rec ?? 0) * s.reception
  pts += perYard(stats.rec_yd ?? 0, s.recYdsPerPoint)
  pts += (stats.rec_td ?? 0) * s.recTd
  pts += (stats.rec_2pt ?? 0) * s.rec2pt

  pts += (stats.fum_lost ?? 0) * s.fumbleLost

  pts += (stats.fg_0_39 ?? 0) * s.fg0to39
  pts += (stats.fg_40_49 ?? 0) * s.fg40to49
  pts += (stats.fg_50_plus ?? 0) * s.fg50plus
  pts += (stats.fg_miss ?? 0) * s.fgMiss
  pts += (stats.xp ?? 0) * s.xp
  pts += (stats.xp_miss ?? 0) * s.xpMiss

  pts += (stats.dst_sack ?? 0) * s.dst.sack
  pts += (stats.dst_int ?? 0) * s.dst.interception
  pts += (stats.dst_fum_rec ?? 0) * s.dst.fumbleRecovery
  pts += (stats.dst_td ?? 0) * s.dst.td
  pts += (stats.dst_safety ?? 0) * s.dst.safety
  pts += (stats.dst_blocked_kick ?? 0) * s.dst.blockedKick
  if (stats.dst_points_allowed !== undefined) {
    pts += pointsAllowedScore(stats.dst_points_allowed, s.dst.pointsAllowedTiers)
  }

  return round2(pts)
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const STARTER_SLOTS = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST'])

export function isStarterSlot(slot: string): boolean {
  return STARTER_SLOTS.has(slot)
}

/** Sum of starter points for one member's weekly lineup. */
export function scoreLineup(
  slots: Pick<FFLineupSlot, 'slot' | 'player_id'>[],
  statsByPlayer: Record<string, FFStatLine>,
  scoring: FFScoringSettings
): number {
  let total = 0
  for (const s of slots) {
    if (!isStarterSlot(s.slot) || !s.player_id) continue
    const stats = statsByPlayer[s.player_id]
    if (stats) total += computeFantasyPoints(stats, scoring)
  }
  return round2(total)
}
