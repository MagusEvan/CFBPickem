import type { DataProvider } from '../provider'
import type { CfbTeam, CfbGame, CfbTeamRecord } from '../types'
import { espnFetch } from './client'
import { adaptEspnTeam, adaptEspnGame } from './adapter'
import { CONFERENCE_MAP, PAC12_ESPN_GROUP, INDEPENDENT_ESPN_GROUP } from '../conference-map'

export class EspnProvider implements DataProvider {
  async getTeamsByConference(conferenceKey: string, year: number): Promise<CfbTeam[]> {
    if (conferenceKey === 'PAC12_IND') {
      const [pac12Res, indRes] = await Promise.all([
        espnFetch<any>('/teams', { groups: PAC12_ESPN_GROUP, limit: '100' }),
        espnFetch<any>('/teams', { groups: INDEPENDENT_ESPN_GROUP, limit: '100' }),
      ])
      const pac12 = (pac12Res.sports?.[0]?.leagues?.[0]?.teams ?? []).map(
        (t: any) => adaptEspnTeam(t, 'PAC12_IND')
      )
      const ind = (indRes.sports?.[0]?.leagues?.[0]?.teams ?? []).map(
        (t: any) => adaptEspnTeam(t, 'PAC12_IND')
      )
      return [...pac12, ...ind]
    }

    const groupId = CONFERENCE_MAP[conferenceKey]?.espnGroupId
    if (!groupId) return []

    const res = await espnFetch<any>('/teams', { groups: groupId, limit: '100' })
    const teams = res.sports?.[0]?.leagues?.[0]?.teams ?? []
    return teams.map((t: any) => adaptEspnTeam(t, conferenceKey))
  }

  async getAllFbsTeams(year: number): Promise<CfbTeam[]> {
    const conferenceKeys = Object.keys(CONFERENCE_MAP)
    const results = await Promise.all(
      conferenceKeys.map((key) => this.getTeamsByConference(key, year))
    )
    return results.flat()
  }

  async getGamesForWeek(year: number, week: number): Promise<CfbGame[]> {
    const res = await espnFetch<any>('/scoreboard', {
      dates: String(year),
      week: String(week),
      groups: '80', // FBS
      limit: '200',
    })
    const events = res.events ?? []
    return events.map(adaptEspnGame)
  }

  async getTeamSchedule(teamId: string, year: number): Promise<CfbGame[]> {
    const res = await espnFetch<any>(`/teams/${teamId}/schedule`, {
      season: String(year),
    })
    const events = res.events ?? []
    return events.map(adaptEspnGame)
  }

  async getTeamRecords(year: number): Promise<CfbTeamRecord[]> {
    // ESPN doesn't have a clean bulk records endpoint
    // We'll derive records from the teams endpoint with standings
    const res = await espnFetch<any>('/standings', {
      season: String(year),
    })
    const records: CfbTeamRecord[] = []
    for (const group of res.children ?? []) {
      for (const entry of group.standings?.entries ?? []) {
        const stats = entry.stats ?? []
        const wins = stats.find((s: any) => s.name === 'wins')?.value ?? 0
        const losses = stats.find((s: any) => s.name === 'losses')?.value ?? 0
        records.push({
          teamId: entry.team?.id ?? '',
          teamName: entry.team?.displayName ?? '',
          wins: Number(wins),
          losses: Number(losses),
        })
      }
    }
    return records
  }
}
