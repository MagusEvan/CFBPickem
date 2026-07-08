import type { FFStatLine } from '@/lib/ff/types'

export interface NflTeamInfo {
  id: string
  abbreviation: string
  displayName: string
  logoUrl: string | null
}

export interface NflPlayerData {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
  position: string
  nflTeamId: string
  nflTeamAbbrev: string
  jersey: string | null
  headshotUrl: string | null
  status: string | null
  injuryStatus: string | null
}

export interface NflGameData {
  id: string
  seasonYear: number
  week: number
  seasonType: number
  homeTeamId: string | null
  awayTeamId: string | null
  homeScore: number | null
  awayScore: number | null
  status: 'scheduled' | 'in_progress' | 'final'
  statusDetail: string | null
  startTime: string
  broadcasts: string[] | null
}

/** Player-keyed stat lines for one NFL game (includes synthesized DST-{abbrev} rows) */
export interface NflGameStats {
  gameId: string
  statLines: Record<string, FFStatLine>
  /** Minimal info for players seen in the box score (for catalog stubs) */
  athletes: Record<string, { name: string; position: string | null }>
}
