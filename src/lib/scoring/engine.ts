import type { ScoringStrategy, ManagerStanding, WorldCupManagerStanding } from './types'
import { winsOnlyStrategy } from './strategies/wins-only'
import { calculateTeamPoints } from './strategies/world-cup'
import type { DraftPick, CachedTeam, CachedGame, PoolMember, Profile, WorldCupScoringConfig } from '@/lib/types'

const strategies: Record<string, ScoringStrategy> = {
  wins_only: winsOnlyStrategy,
}

export function getStrategy(name: string): ScoringStrategy {
  return strategies[name] ?? winsOnlyStrategy
}

export function calculateStandings(
  members: (PoolMember & { profiles: Profile })[],
  picks: DraftPick[],
  teams: CachedTeam[],
  strategyName: string
): ManagerStanding[] {
  const strategy = getStrategy(strategyName)
  const teamMap = new Map(teams.map((t) => [t.id, t]))

  return members
    .map((member) => {
      const memberPicks = picks.filter((p) => p.member_id === member.id)
      let totalWins = 0
      let totalLosses = 0

      for (const pick of memberPicks) {
        const team = teamMap.get(pick.team_id)
        if (team) {
          totalWins += team.wins
          totalLosses += team.losses
        }
      }

      return {
        memberId: member.id,
        displayName: member.profiles.display_name,
        totalPoints: strategy.calculate(totalWins, totalLosses),
        totalWins,
        totalLosses,
        teamCount: memberPicks.length,
      }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
}

export function calculateWorldCupStandings(
  members: (PoolMember & { profiles: Profile })[],
  picks: DraftPick[],
  games: CachedGame[],
  config: WorldCupScoringConfig
): WorldCupManagerStanding[] {
  return members
    .map((member) => {
      const memberPicks = picks.filter((p) => p.member_id === member.id)
      const teamBreakdowns: WorldCupManagerStanding['teamBreakdowns'] = []
      let totalPoints = 0

      for (const pick of memberPicks) {
        const { totalPoints: teamPts, breakdown } = calculateTeamPoints(
          games,
          pick.team_id,
          config
        )
        teamBreakdowns.push({
          teamId: pick.team_id,
          teamName: pick.team_name,
          points: teamPts,
          gamesPlayed: breakdown.length,
        })
        totalPoints += teamPts
      }

      return {
        memberId: member.id,
        displayName: member.profiles.display_name,
        totalPoints,
        teamBreakdowns,
      }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
}
