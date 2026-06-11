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
  statusDetail: string | null
  startTime: string | null
  venue: string | null
  broadcasts: import('@/lib/types').GameBroadcast[]
}

export interface CfbTeamRecord {
  teamId: string
  teamName: string
  wins: number
  losses: number
}

// World Cup types

export type WcStage =
  | 'group'
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter'
  | 'semi'
  | 'third_place'
  | 'final'

export interface WcTeam {
  id: string
  name: string
  abbreviation: string
  group: string
  logoUrl: string | null
  flagUrl: string | null
}

export interface WcGame {
  id: string
  stage: WcStage
  homeTeam: { id: string; name: string; score: number | null }
  awayTeam: { id: string; name: string; score: number | null }
  status: 'scheduled' | 'in_progress' | 'final'
  statusDetail: string | null
  startTime: string | null
  venue: string | null
  isOvertime: boolean
  isShootout: boolean
  homePenaltyScore: number | null
  awayPenaltyScore: number | null
  broadcasts: import('@/lib/types').GameBroadcast[]
}
