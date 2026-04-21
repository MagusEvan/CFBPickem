import type { DataProvider } from '../provider'
import type { CfbTeam, CfbGame, CfbTeamRecord } from '../types'
import { cfbdFetch } from './client'
import { adaptTeam, adaptGame, adaptRecord } from './adapter'
import { CONFERENCE_MAP, PAC12_CFBD, INDEPENDENT_CFBD } from '../conference-map'

// Reverse map: CFBD conference name -> our internal key
const CFBD_TO_KEY: Record<string, string> = {}
for (const [key, val] of Object.entries(CONFERENCE_MAP)) {
  if (val.cfbd) {
    CFBD_TO_KEY[val.cfbd] = key
  }
}

export class CfbdProvider implements DataProvider {
  async getAllFbsTeams(year: number): Promise<CfbTeam[]> {
    const teams = await cfbdFetch<any[]>('/teams/fbs', { year: String(year) })
    return teams.map((t) => {
      const conf = t.conference as string | null
      // Map to our internal key
      let conferenceKey = conf ? (CFBD_TO_KEY[conf] ?? null) : null
      // Pac-12 and Independents both map to PAC12_IND
      if (conf === PAC12_CFBD || conf === INDEPENDENT_CFBD) {
        conferenceKey = 'PAC12_IND'
      }
      return adaptTeam(t, conferenceKey ?? 'UNKNOWN')
    }).filter((t) => t.conferenceKey !== 'UNKNOWN')
  }

  async getTeamsByConference(conferenceKey: string, year: number): Promise<CfbTeam[]> {
    const allTeams = await this.getAllFbsTeams(year)
    return allTeams.filter((t) => t.conferenceKey === conferenceKey)
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
