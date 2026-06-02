import type { WcTeam, WcGame, WcStage } from '../types'
import { getWorldCupTeams } from './teams'
import { fetchWorldCupGames } from './espn-adapter'

export interface WorldCupDataProvider {
  getAllTeams(year: number): Promise<WcTeam[]>
  getAllGames(year: number): Promise<WcGame[]>
  getGamesByStage(year: number, stage: WcStage): Promise<WcGame[]>
  getTeamGames(teamId: string, year: number): Promise<WcGame[]>
}

export class EspnWorldCupProvider implements WorldCupDataProvider {
  async getAllTeams(year: number): Promise<WcTeam[]> {
    return getWorldCupTeams(year)
  }

  async getAllGames(year: number): Promise<WcGame[]> {
    return fetchWorldCupGames(year)
  }

  async getGamesByStage(year: number, stage: WcStage): Promise<WcGame[]> {
    const games = await this.getAllGames(year)
    return games.filter((g) => g.stage === stage)
  }

  async getTeamGames(teamId: string, year: number): Promise<WcGame[]> {
    const games = await this.getAllGames(year)
    return games.filter(
      (g) => g.homeTeam.id === teamId || g.awayTeam.id === teamId
    )
  }
}

export function getWorldCupProvider(): WorldCupDataProvider {
  return new EspnWorldCupProvider()
}
