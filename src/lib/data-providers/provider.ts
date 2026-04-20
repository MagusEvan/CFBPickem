import type { CfbTeam, CfbGame, CfbTeamRecord } from './types'

export interface DataProvider {
  getTeamsByConference(conferenceKey: string, year: number): Promise<CfbTeam[]>
  getAllFbsTeams(year: number): Promise<CfbTeam[]>
  getGamesForWeek(year: number, week: number): Promise<CfbGame[]>
  getTeamSchedule(teamId: string, year: number): Promise<CfbGame[]>
  getTeamRecords(year: number): Promise<CfbTeamRecord[]>
}
