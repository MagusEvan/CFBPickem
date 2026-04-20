export interface ScoringStrategy {
  name: string
  calculate(wins: number, losses: number, extras?: Record<string, number>): number
}

export interface ManagerStanding {
  memberId: string
  displayName: string
  totalPoints: number
  totalWins: number
  totalLosses: number
  teamCount: number
}
