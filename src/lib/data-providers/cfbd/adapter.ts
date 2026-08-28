import type { CfbTeam, CfbGame, CfbTeamRecord } from '../types'

// CFBD API response shapes

interface CfbdTeam {
  id: number
  school: string
  mascot: string
  abbreviation: string
  conference: string | null
  color: string | null
  alternateColor: string | null
  logos: string[] | null
}

interface CfbdGame {
  id: number
  season: number
  week: number
  homeTeam: string
  awayTeam: string
  homeId: number
  awayId: number
  homePoints: number | null
  awayPoints: number | null
  completed: boolean
  startDate: string
  venue: string | null
}

interface CfbdRecord {
  team: string
  teamId: number
  total: { games: number; wins: number; losses: number }
}

export function adaptTeam(team: CfbdTeam, conferenceKey: string): CfbTeam {
  return {
    id: String(team.id),
    name: team.school,
    abbreviation: team.abbreviation || team.school.substring(0, 4).toUpperCase(),
    conferenceKey,
    logoUrl: team.logos?.[0] ?? null,
    colorPrimary: team.color ? `#${team.color.replace('#', '')}` : null,
    colorSecondary: team.alternateColor ? `#${team.alternateColor.replace('#', '')}` : null,
  }
}

export function adaptGame(game: CfbdGame): CfbGame {
  return {
    id: String(game.id),
    week: game.week,
    seasonYear: game.season,
    homeTeam: {
      id: String(game.homeId),
      name: game.homeTeam,
      score: game.homePoints,
    },
    awayTeam: {
      id: String(game.awayId),
      name: game.awayTeam,
      score: game.awayPoints,
    },
    status: game.completed ? 'final' : 'scheduled',
    statusDetail: null,
    startTime: game.startDate,
    venue: game.venue,
    broadcasts: [],
  }
}

export function adaptRecord(record: CfbdRecord): CfbTeamRecord {
  return {
    teamId: String(record.teamId),
    teamName: record.team,
    wins: record.total.wins,
    losses: record.total.losses,
  }
}
