import type { PgaGolfer, PgaDraftPick, PgaTournamentMember } from '@/lib/types'

export interface GolferRoundScore {
  golferId: string
  golferName: string
  position: string | null
  status: PgaGolfer['status']
  teeTime: string | null
  thru: string | null
  totalScore: number | null    // relative to par
  totalStrokes: number | null
  roundStrokes: (number | null)[]  // R1-R4
  roundScores: (number | null)[]   // R1-R4 relative to par
  /** Whether this golfer's score counts toward the manager's total for each round */
  countsForRound: boolean[]
}

export interface ManagerStanding {
  memberId: string
  memberName: string
  golfers: GolferRoundScore[]
  /** Best top-N strokes per round (sum of counting scores) */
  roundTotals: (number | null)[]
  /** Cumulative strokes across all rounds (sum of roundTotals) */
  cumulativeStrokes: number | null
  /** Cumulative score relative to par */
  cumulativeScore: number | null
}

/**
 * Calculate PGA standings with top-N scoring.
 *
 * For each round, a manager's score is the sum of the best `topN` round strokes
 * among their drafted golfers. Lower cumulative strokes = better.
 */
export function calculatePgaStandings(
  members: PgaTournamentMember[],
  picks: PgaDraftPick[],
  golfers: PgaGolfer[],
  topN: number
): ManagerStanding[] {
  const golferMap = new Map(golfers.map((g) => [g.id, g]))

  const standings: ManagerStanding[] = members.map((member) => {
    const memberPicks = picks.filter((p) => p.member_id === member.id)

    const golferScores: GolferRoundScore[] = memberPicks.map((pick) => {
      const golfer = golferMap.get(pick.golfer_id)
      return {
        golferId: pick.golfer_id,
        golferName: pick.golfer_name,
        position: golfer?.position ?? null,
        status: golfer?.status ?? 'active',
        teeTime: golfer?.tee_time ?? null,
        thru: golfer?.thru ?? null,
        totalScore: golfer?.total_score ?? null,
        totalStrokes: golfer?.total_strokes ?? null,
        roundStrokes: [
          golfer?.r1_strokes ?? null,
          golfer?.r2_strokes ?? null,
          golfer?.r3_strokes ?? null,
          golfer?.r4_strokes ?? null,
        ],
        roundScores: [
          golfer?.r1_score ?? null,
          golfer?.r2_score ?? null,
          golfer?.r3_score ?? null,
          golfer?.r4_score ?? null,
        ],
        countsForRound: [false, false, false, false],
      }
    })

    // For each round, pick the best topN strokes
    const roundTotals: (number | null)[] = []

    for (let r = 0; r < 4; r++) {
      // Get golfers who have a score for this round
      const withScores = golferScores
        .map((gs, idx) => ({ gs, idx, strokes: gs.roundStrokes[r] }))
        .filter((x) => x.strokes !== null) as { gs: GolferRoundScore; idx: number; strokes: number }[]

      if (withScores.length === 0) {
        roundTotals.push(null)
        continue
      }

      // Sort by strokes ascending (lower is better)
      withScores.sort((a, b) => a.strokes - b.strokes)

      // Take best topN
      const counting = withScores.slice(0, topN)
      const total = counting.reduce((sum, x) => sum + x.strokes, 0)
      roundTotals.push(total)

      // Mark which golfers count
      for (const c of counting) {
        golferScores[c.idx].countsForRound[r] = true
      }
    }

    // Cumulative strokes = sum of round totals where we have data
    const validRounds = roundTotals.filter((r): r is number => r !== null)
    const cumulativeStrokes = validRounds.length > 0 ? validRounds.reduce((a, b) => a + b, 0) : null

    // Cumulative score relative to par = sum of counting golfers' round scores
    let cumulativeScore: number | null = null
    if (cumulativeStrokes !== null) {
      let scoreSum = 0
      for (let r = 0; r < 4; r++) {
        for (const gs of golferScores) {
          if (gs.countsForRound[r] && gs.roundScores[r] !== null) {
            scoreSum += gs.roundScores[r]!
          }
        }
      }
      cumulativeScore = scoreSum
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

  // Sort: lower cumulative strokes is better, null goes to bottom
  standings.sort((a, b) => {
    if (a.cumulativeStrokes === null && b.cumulativeStrokes === null) return 0
    if (a.cumulativeStrokes === null) return 1
    if (b.cumulativeStrokes === null) return -1
    return a.cumulativeStrokes - b.cumulativeStrokes
  })

  return standings
}

/** Format a score relative to par for display (e.g. -5 → "-5", 0 → "E", 3 → "+3") */
export function formatScoreToPar(score: number | null): string {
  if (score === null) return '—'
  if (score === 0) return 'E'
  return score > 0 ? `+${score}` : String(score)
}
