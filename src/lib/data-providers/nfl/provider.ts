import type { NflTeamInfo, NflPlayerData, NflGameData, NflGameStats } from './types'
import { fetchNflTeams, fetchTeamRoster, fetchWeekScoreboard, fetchGameSummary } from './espn-adapter'

export interface NflDataProvider {
  getTeams(): Promise<NflTeamInfo[]>
  getTeamRoster(team: NflTeamInfo): Promise<NflPlayerData[]>
  getWeekGames(year: number, week: number, seasonType?: number): Promise<NflGameData[]>
  getGameStats(eventId: string): Promise<NflGameStats>
}

export class EspnNflProvider implements NflDataProvider {
  async getTeams(): Promise<NflTeamInfo[]> {
    return fetchNflTeams()
  }

  async getTeamRoster(team: NflTeamInfo): Promise<NflPlayerData[]> {
    return fetchTeamRoster(team)
  }

  async getWeekGames(year: number, week: number, seasonType = 2): Promise<NflGameData[]> {
    return fetchWeekScoreboard(year, week, seasonType)
  }

  async getGameStats(eventId: string): Promise<NflGameStats> {
    return fetchGameSummary(eventId)
  }
}

export function getNflProvider(): NflDataProvider {
  return new EspnNflProvider()
}
