// Fetch + shape ESPN NFL payloads into our canonical Nfl* types.
// Payload shapes verified against live responses (2025 season spike).

import { nflFetch } from './client'
import { mapGameSummary } from './stat-map'
import type {
  EspnBoxscoreTeamPlayers,
  EspnScoringPlay,
  EspnSummaryCompetitor,
} from './stat-map'
import type { NflTeamInfo, NflPlayerData, NflGameData, NflGameStats } from './types'

// --- Raw payload shapes (only fields we read) ---

interface TeamsResponse {
  sports: Array<{
    leagues: Array<{
      teams: Array<{
        team: {
          id: string
          abbreviation: string
          displayName: string
          logos?: Array<{ href: string }>
        }
      }>
    }>
  }>
}

interface RosterResponse {
  athletes: Array<{
    position: string // group: offense | defense | specialTeam | ...
    items: Array<{
      id: string
      fullName: string
      firstName?: string
      lastName?: string
      jersey?: string
      position?: { abbreviation?: string }
      headshot?: { href?: string }
      status?: { type?: string }
      injuries?: Array<{ status?: string }>
    }>
  }>
}

interface ScoreboardResponse {
  events: Array<{
    id: string
    date: string
    season: { year: number; type: number }
    week: { number: number }
    competitions: Array<{
      competitors: Array<{
        team: { id: string; abbreviation: string }
        homeAway: 'home' | 'away'
        score?: string
      }>
      broadcasts?: Array<{ names?: string[] }>
    }>
    status: { type: { state: 'pre' | 'in' | 'post'; shortDetail?: string } }
  }>
}

interface SummaryResponse {
  boxscore?: { players?: EspnBoxscoreTeamPlayers[] }
  scoringPlays?: EspnScoringPlay[]
  header?: { competitions?: Array<{ competitors?: EspnSummaryCompetitor[] }> }
}

// --- Fetchers ---

export async function fetchNflTeams(): Promise<NflTeamInfo[]> {
  const data = await nflFetch<TeamsResponse>('teams', { limit: '40' })
  const teams = data.sports?.[0]?.leagues?.[0]?.teams ?? []
  return teams.map(({ team }) => ({
    id: team.id,
    abbreviation: team.abbreviation,
    displayName: team.displayName,
    logoUrl: team.logos?.[0]?.href ?? null,
  }))
}

// Roster groups worth skipping: practice squad players aren't rosterable in
// standard leagues, but injured-reserve players are (IR slot), so keep them.
const SKIPPED_GROUPS = new Set(['practiceSquad'])

export async function fetchTeamRoster(team: NflTeamInfo): Promise<NflPlayerData[]> {
  const data = await nflFetch<RosterResponse>(`teams/${team.id}/roster`)
  const players: NflPlayerData[] = []
  for (const group of data.athletes ?? []) {
    if (SKIPPED_GROUPS.has(group.position)) continue
    for (const item of group.items ?? []) {
      const position = item.position?.abbreviation
      if (!position) continue
      players.push({
        id: item.id,
        name: item.fullName,
        firstName: item.firstName ?? null,
        lastName: item.lastName ?? null,
        position,
        nflTeamId: team.id,
        nflTeamAbbrev: team.abbreviation,
        jersey: item.jersey ?? null,
        headshotUrl: item.headshot?.href ?? null,
        status: item.status?.type ?? null,
        injuryStatus: item.injuries?.[0]?.status ?? null,
      })
    }
  }
  return players
}

const STATUS_MAP = { pre: 'scheduled', in: 'in_progress', post: 'final' } as const

export async function fetchWeekScoreboard(
  year: number,
  week: number,
  seasonType = 2
): Promise<NflGameData[]> {
  const data = await nflFetch<ScoreboardResponse>('scoreboard', {
    dates: String(year),
    seasontype: String(seasonType),
    week: String(week),
  })

  return (data.events ?? []).map((event) => {
    const comp = event.competitions[0]
    const home = comp?.competitors.find((c) => c.homeAway === 'home')
    const away = comp?.competitors.find((c) => c.homeAway === 'away')
    const status = STATUS_MAP[event.status.type.state]
    const scoreOf = (v: string | undefined) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    return {
      id: event.id,
      seasonYear: event.season.year,
      week: event.week.number,
      seasonType: event.season.type,
      homeTeamId: home?.team.id ?? null,
      awayTeamId: away?.team.id ?? null,
      // Scores only meaningful once the game has started
      homeScore: status === 'scheduled' ? null : scoreOf(home?.score),
      awayScore: status === 'scheduled' ? null : scoreOf(away?.score),
      status,
      statusDetail: event.status.type.shortDetail ?? null,
      startTime: event.date,
      broadcasts: comp?.broadcasts?.flatMap((b) => b.names ?? []) ?? null,
    }
  })
}

export async function fetchGameSummary(eventId: string): Promise<NflGameStats> {
  const data = await nflFetch<SummaryResponse>('summary', { event: eventId })
  const { statLines, athletes } = mapGameSummary({
    boxscorePlayers: data.boxscore?.players ?? [],
    scoringPlays: data.scoringPlays ?? [],
    competitors: data.header?.competitions?.[0]?.competitors ?? [],
  })
  return { gameId: eventId, statLines, athletes }
}
