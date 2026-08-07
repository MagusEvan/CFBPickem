'use server'

// On-demand player detail for the player sheet — fetched per player when the
// sheet opens rather than shipping every player's game log to the client.

import { createClient } from '@/lib/supabase/server'
import { resolveScoringSettings } from './settings'
import { computeFantasyPoints } from './scoring'
import {
  getFfCurrentWeek,
  getFfPlayerGameLog,
  getFfWeekGames,
  getNflByeWeeks,
  getNflTeamAbbrevs,
} from './queries'
import {
  formatStatLine,
  playerGameInfo,
  weekGamesByTeamId,
  type PlayerGameInfo,
} from './stat-format'
import type { FFPlayer } from './types'

export interface FFPlayerDetail {
  log: Array<{ week: number; points: number; statLine: string }>
  totalPts: number
  avgPts: number
  currentGame: PlayerGameInfo | null
  byeWeek: number | null
}

export async function getFfPlayerDetail(
  poolId: string,
  playerId: string
): Promise<FFPlayerDetail | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Pool-member guard + scoring settings in one read (RLS scopes the row)
  const [poolRes, memberRes, playerRes] = await Promise.all([
    supabase
      .from('pools')
      .select('id, season_year, ff_scoring_settings')
      .eq('id', poolId)
      .single(),
    supabase
      .from('pool_members')
      .select('id')
      .eq('pool_id', poolId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('ff_players').select('*').eq('id', playerId).single(),
  ])
  if (!poolRes.data) return { error: 'Pool not found' }
  if (!memberRes.data) return { error: 'You are not a member of this pool' }
  const player = playerRes.data as FFPlayer | null
  if (!player) return { error: 'Player not found' }

  const seasonYear = poolRes.data.season_year
  const scoring = resolveScoringSettings(poolRes.data)

  const [rawLog, currentWeek, byeWeeks, abbrevByTeamId] = await Promise.all([
    getFfPlayerGameLog(playerId, seasonYear),
    getFfCurrentWeek(seasonYear),
    getNflByeWeeks(seasonYear),
    getNflTeamAbbrevs(),
  ])
  const weekGames = await getFfWeekGames(seasonYear, currentWeek)

  const log = rawLog.map((entry) => ({
    week: entry.week,
    points: computeFantasyPoints(entry.stats, scoring),
    statLine: formatStatLine(entry.stats, player.position),
  }))
  const totalPts = Math.round(log.reduce((sum, e) => sum + e.points, 0) * 100) / 100
  const avgPts = log.length > 0 ? Math.round((totalPts / log.length) * 100) / 100 : 0

  return {
    log,
    totalPts,
    avgPts,
    currentGame: playerGameInfo(
      player.nfl_team_id,
      weekGamesByTeamId(weekGames),
      abbrevByTeamId
    ),
    byeWeek: player.nfl_team_id ? byeWeeks[player.nfl_team_id] ?? null : null,
  }
}
