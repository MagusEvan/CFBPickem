// Shared types for data providers — provider-agnostic

export interface CfbTeam {
  id: string
  name: string
  abbreviation: string
  conferenceKey: string
  logoUrl: string | null
  colorPrimary: string | null
  colorSecondary: string | null
}

export interface CfbGame {
  id: string
  week: number
  seasonYear: number
  homeTeam: { id: string; name: string; score: number | null }
  awayTeam: { id: string; name: string; score: number | null }
  status: 'scheduled' | 'in_progress' | 'final'
  startTime: string | null
  venue: string | null
}

export interface CfbTeamRecord {
  teamId: string
  teamName: string
  wins: number
  losses: number
}
