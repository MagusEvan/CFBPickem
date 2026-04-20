import type { DataProvider } from '../provider'
import type { CfbTeam, CfbGame, CfbTeamRecord } from '../types'
import { cfbdFetch } from './client'
import { adaptTeam, adaptGame, adaptRecord } from './adapter'
import { CONFERENCE_MAP, PAC12_CFBD, INDEPENDENT_CFBD } from '../conference-map'

export class CfbdProvider implements DataProvider {
  async getTeamsByConference(conferenceKey: string, year: number): Promise<CfbTeam[]> {
    if (conferenceKey === 'PAC12_IND') {
      const [pac12, independents] = await Promise.all([
        cfbdFetch<any[]>('/teams', { conference: PAC12_CFBD }),
        cfbdFetch<any[]>('/teams', { conference: INDEPENDENT_CFBD }),
      ])
      return [
        ...pac12.map((t) => adaptTeam(t, 'PAC12_IND')),
        ...independents.map((t) => adaptTeam(t, 'PAC12_IND')),
      ]
    }

    const cfbdName = CONFERENCE_MAP[conferenceKey]?.cfbd
    if (!cfbdName) return []

    const teams = await cfbdFetch<any[]>('/teams', { conference: cfbdName })
    return teams.map((t) => adaptTeam(t, conferenceKey))
  }

  async getAllFbsTeams(year: number): Promise<CfbTeam[]> {
    const conferenceKeys = Object.keys(CONFERENCE_MAP)
    const results = await Promise.all(
      conferenceKeys.map((key) => this.getTeamsByConference(key, year))
    )
    return results.flat()
  }

  async getGamesForWeek(year: number, week: number): Promise<CfbGame[]> {
    const games = await cfbdFetch<any[]>('/games', {
      year: String(year),
      week: String(week),
      division: 'fbs',
    })
    return games.map(adaptGame)
  }

  async getTeamSchedule(teamId: string, year: number): Promise<CfbGame[]> {
    // CFBD uses team name for schedule lookup, but we store ID
    // We'll need to fetch by year and filter
    const games = await cfbdFetch<any[]>('/games', {
      year: String(year),
      division: 'fbs',
    })
    return games
      .filter((g) => String(g.home_id) === teamId || String(g.away_id) === teamId)
      .map(adaptGame)
  }

  async getTeamRecords(year: number): Promise<CfbTeamRecord[]> {
    const records = await cfbdFetch<any[]>('/records', {
      year: String(year),
    })
    return records.map(adaptRecord)
  }
}
