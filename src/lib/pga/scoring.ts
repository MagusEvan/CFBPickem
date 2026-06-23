import type { PgaGolfer, PgaDraftPick, PgaTournamentMember } from '@/lib/types'

export interface GolferRoundScore {
  golferId: string
  golferName: string
  position: string | null
  status: PgaGolfer['status']
  teeTime: string | null
  thru: string | null
  totalScore: number | null    // relative to par (all rounds)
  totalStrokes: number | null
  /** Sum of only the rounds where this golfer counted toward the manager total */
  contribution: number | null
  roundStrokes: (number | null)[]  // R1-R4
  roundScores: (number | null)[]   // R1-R4 relative to par
  /** Whether this golfer's score counts toward the manager's total for each round */
  countsForRound: boolean[]
  /** Whether each round is a penalty (missed cut / WD) */
  isPenalty: boolean[]
}

export interface ManagerStanding {
  memberId: string
  memberName: string
  golfers: GolferRoundScore[]
  /** Best top-N score-to-par per round (sum of counting golfers' roundScores) */
  roundTotals: (number | null)[]
  /** Cumulative strokes across all rounds */
  cumulativeStrokes: number | null
  /** Cumulative score relative to par (sum of roundTotals) */
  cumulativeScore: number | null
}

/**
 * Calculate PGA standings with top-N scoring and missed-cut penalties.
 *
 * For each round, a manager's score is the sum of the best `topN` round scores (to par)
 * among their drafted golfers. Lower cumulative score = better.
 *
 * Cut/WD golfers receive `missedCutScore` strokes for missing rounds.
 */
export function calculatePgaStandings(
  members: PgaTournamentMember[],
  picks: PgaDraftPick[],
  golfers: PgaGolfer[],
  topN: number,
  coursePar: number,
  missedCutScore: number
): ManagerStanding[] {
  const golferMap = new Map(golfers.map((g) => [g.id, g]))

  const standings: ManagerStanding[] = members.map((member) => {
    const memberPicks = picks.filter((p) => p.member_id === member.id)

    const golferScores: GolferRoundScore[] = memberPicks.map((pick) => {
      const golfer = golferMap.get(pick.golfer_id)
      const status = golfer?.status ?? 'active'

      const roundStrokes: (number | null)[] = [
        golfer?.r1_strokes ?? null,
        golfer?.r2_strokes ?? null,
        golfer?.r3_strokes ?? null,
        golfer?.r4_strokes ?? null,
      ]
      const roundScores: (number | null)[] = [
        golfer?.r1_score ?? null,
        golfer?.r2_score ?? null,
        golfer?.r3_score ?? null,
        golfer?.r4_score ?? null,
      ]
      const isPenalty = [false, false, false, false]

      // Apply missed-cut/WD penalties for missing rounds
      if (status === 'cut' || status === 'withdrawn') {
        // Only apply penalty to rounds where the golfer has no real score
        // but at least one earlier round was played (so the tournament has started for them)
        // Note: 0 strokes is impossible in golf, so treat it as unplayed too
        const hasPlayedAnyRound = roundStrokes.some((s) => s !== null && s > 0)
        if (hasPlayedAnyRound) {
          for (let r = 0; r < 4; r++) {
            if (roundStrokes[r] === null || roundStrokes[r] === 0) {
              roundStrokes[r] = missedCutScore
              roundScores[r] = missedCutScore - coursePar
              isPenalty[r] = true
            }
          }
        }
      }

      // Recalculate totals
      const playedStrokes = roundStrokes.filter((s): s is number => s !== null)
      const totalStrokes = playedStrokes.length > 0
        ? playedStrokes.reduce((a, b) => a + b, 0)
        : null
      const playedScores = roundScores.filter((s): s is number => s !== null)
      const totalScore = playedScores.length > 0
        ? playedScores.reduce((a, b) => a + b, 0)
        : null

      return {
        golferId: pick.golfer_id,
        golferName: pick.golfer_name,
        position: golfer?.position ?? null,
        status,
        teeTime: golfer?.tee_time ?? null,
        thru: golfer?.thru ?? null,
        totalScore,
        totalStrokes,
        contribution: null,
        roundStrokes,
        roundScores,
        countsForRound: [false, false, false, false],
        isPenalty,
      }
    })

    // For each round, pick the best topN scores (to par)
    const roundTotals: (number | null)[] = []

    for (let r = 0; r < 4; r++) {
      const withScores = golferScores
        .map((gs, idx) => ({ gs, idx, score: gs.roundScores[r], strokes: gs.roundStrokes[r] }))
        .filter((x) => x.score !== null && x.strokes !== null) as {
          gs: GolferRoundScore; idx: number; score: number; strokes: number
        }[]

      if (withScores.length === 0) {
        roundTotals.push(null)
        continue
      }

      // Sort by score-to-par ascending (lower/more negative is better)
      withScores.sort((a, b) => a.score - b.score)

      // Take best topN, but include all golfers tied with the Nth score
      const cutoffScore = withScores[Math.min(topN - 1, withScores.length - 1)].score
      const counting = withScores.filter((x, i) => i < topN || x.score === cutoffScore)

      // Round total uses only the best topN scores (not extras from ties)
      const roundScoreTotal = withScores.slice(0, topN).reduce((sum, x) => sum + x.score, 0)
      roundTotals.push(roundScoreTotal)

      // Mark all tied golfers as counting (for contribution display)
      for (const c of counting) {
        golferScores[c.idx].countsForRound[r] = true
      }
    }

    // Compute contribution per golfer: sum of roundScores where they counted
    for (const gs of golferScores) {
      let contribSum = 0
      let hasContrib = false
      for (let r = 0; r < 4; r++) {
        if (gs.countsForRound[r] && gs.roundScores[r] !== null) {
          contribSum += gs.roundScores[r]!
          hasContrib = true
        }
      }
      gs.contribution = hasContrib ? contribSum : null
    }

    // Cumulative score = sum of round totals (to par)
    const validRounds = roundTotals.filter((r): r is number => r !== null)
    const cumulativeScore = validRounds.length > 0 ? validRounds.reduce((a, b) => a + b, 0) : null

    // Cumulative strokes for reference
    let cumulativeStrokes: number | null = null
    if (cumulativeScore !== null) {
      let strokeSum = 0
      for (let r = 0; r < 4; r++) {
        for (const gs of golferScores) {
          if (gs.countsForRound[r] && gs.roundStrokes[r] !== null) {
            strokeSum += gs.roundStrokes[r]!
          }
        }
      }
      cumulativeStrokes = strokeSum
    }

    return {
      memberId: member.id,
      memberName: member.pool_member?.profiles?.display_name ?? 'Unknown',
      golfers: golferScores,
      roundTotals,
      cumulativeStrokes,
      cumulativeScore,
    }
  })

  // Sort: lower cumulative score is better, null goes to bottom
  standings.sort((a, b) => {
    if (a.cumulativeScore === null && b.cumulativeScore === null) return 0
    if (a.cumulativeScore === null) return 1
    if (b.cumulativeScore === null) return -1
    return a.cumulativeScore - b.cumulativeScore
  })

  return standings
}

/** Format a score relative to par for display (e.g. -5 → "-5", 0 → "E", 3 → "+3") */
export function formatScoreToPar(score: number | null): string {
  if (score === null) return '—'
  if (score === 0) return 'E'
  return score > 0 ? `+${score}` : String(score)
}
