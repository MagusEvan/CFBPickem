import type { CfbTeam, CfbGame, CfbTeamRecord } from '../types'

// CFBD API response shapes

interface CfbdTeam {
  id: number
  school: string
  mascot: string
  abbreviation: string
  conference: string | null
  color: string | null
  alt_color: string | null
  logos: string[] | null
}

interface CfbdGame {
  id: number
  season: number
  week: number
  home_team: string
  away_team: string
  home_id: number
  away_id: number
  home_points: number | null
  away_points: number | null
  completed: boolean
  start_date: string
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
    colorSecondary: team.alt_color ? `#${team.alt_color.replace('#', '')}` : null,
  }
}

export function adaptGame(game: CfbdGame): CfbGame {
  return {
    id: String(game.id),
    week: game.week,
    seasonYear: game.season,
    homeTeam: {
      id: String(game.home_id),
      name: game.home_team,
      score: game.home_points,
    },
    awayTeam: {
      id: String(game.away_id),
      name: game.away_team,
      score: game.away_points,
    },
    status: game.completed ? 'final' : 'scheduled',
    startTime: game.start_date,
    venue: game.venue,
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
