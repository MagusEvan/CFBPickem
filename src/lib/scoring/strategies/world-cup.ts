import type { WorldCupScoringConfig, CachedGame } from '@/lib/types'

export interface GamePointBreakdown {
  gameId: string
  stage: string
  opponent: string
  myGoals: number
  oppGoals: number
  result: string // 'W', 'D', 'L', 'OT-W', 'OT-L', 'PK-W', 'PK-L'
  points: number
  itemized: { label: string; value: number }[]
}

/**
 * Score a single World Cup game for a given team.
 */
export function scoreWorldCupGame(
  game: CachedGame,
  teamId: string,
  config: WorldCupScoringConfig
): GamePointBreakdown | null {
  if (game.status !== 'final') return null
  if (game.home_score == null || game.away_score == null) return null

  const isHome = game.home_team_id === teamId
  const myScore = isHome ? game.home_score : game.away_score
  const oppScore = isHome ? game.away_score : game.home_score
  const opponent = isHome ? game.away_team_id : game.home_team_id

  let points = 0
  let result = ''
  const itemized: { label: string; value: number }[] = []
  const isGroupStage = game.stage === 'group'

  if (isGroupStage) {
    const g = config.group

    if (myScore > oppScore) {
      points += g.win
      itemized.push({ label: 'Win', value: g.win })
      result = 'W'
    } else if (myScore === oppScore) {
      points += g.draw
      itemized.push({ label: 'Draw', value: g.draw })
      result = 'D'
    } else {
      result = 'L'
    }

    // Goals (capped)
    const goalPts = Math.min(myScore, g.goal_cap) * g.goal_points
    points += goalPts
    if (goalPts > 0) itemized.push({ label: 'Goals', value: goalPts })

    // Shutout
    if (oppScore === 0) {
      points += g.shutout
      itemized.push({ label: 'Shutout', value: g.shutout })
    }
  } else {
    // Knockout stage
    const k = config.knockout

    if (game.is_shootout) {
      const myPK = isHome ? (game.home_penalty_score ?? 0) : (game.away_penalty_score ?? 0)
      const oppPK = isHome ? (game.away_penalty_score ?? 0) : (game.home_penalty_score ?? 0)
      if (myPK > oppPK) {
        points += k.shootout_win
        itemized.push({ label: 'PK Win', value: k.shootout_win })
        result = 'PK-W'
      } else {
        points += k.shootout_loss
        if (k.shootout_loss > 0) itemized.push({ label: 'PK Loss', value: k.shootout_loss })
        result = 'PK-L'
      }
    } else if (game.is_overtime) {
      if (myScore > oppScore) {
        points += k.ot_win
        itemized.push({ label: 'OT Win', value: k.ot_win })
        result = 'OT-W'
      } else {
        points += k.ot_loss
        if (k.ot_loss > 0) itemized.push({ label: 'OT Loss', value: k.ot_loss })
        result = 'OT-L'
      }
    } else {
      if (myScore > oppScore) {
        points += k.win
        itemized.push({ label: 'Win', value: k.win })
        result = 'W'
      } else {
        points += k.loss
        result = 'L'
      }
    }

    // Goals (no cap in knockout)
    const goalCap = k.goal_cap ?? Infinity
    const goalPts = Math.min(myScore, goalCap) * k.goal_points
    points += goalPts
    if (goalPts > 0) itemized.push({ label: 'Goals', value: goalPts })

    // Shutout
    if (oppScore === 0) {
      points += k.shutout
      itemized.push({ label: 'Shutout', value: k.shutout })
    }
  }

  return {
    gameId: game.id,
    stage: game.stage ?? 'group',
    opponent,
    myGoals: myScore,
    oppGoals: oppScore,
    result,
    points,
    itemized,
  }
}

/**
 * Calculate total points for a team across all their completed games.
 */
export function calculateTeamPoints(
  games: CachedGame[],
  teamId: string,
  config: WorldCupScoringConfig
): { totalPoints: number; breakdown: GamePointBreakdown[] } {
  const breakdown: GamePointBreakdown[] = []
  let totalPoints = 0

  for (const game of games) {
    if (game.home_team_id !== teamId && game.away_team_id !== teamId) continue
    const result = scoreWorldCupGame(game, teamId, config)
    if (result) {
      breakdown.push(result)
      totalPoints += result.points
    }
  }

  return { totalPoints, breakdown }
}
