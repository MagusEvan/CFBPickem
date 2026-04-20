import type { ScoringStrategy } from '../types'

export const winsOnlyStrategy: ScoringStrategy = {
  name: 'wins_only',
  calculate(wins: number): number {
    return wins
  },
}
