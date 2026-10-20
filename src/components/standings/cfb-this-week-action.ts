'use server'

import { createClient } from '@/lib/supabase/server'
import type { GameInfo } from './cfb-this-week'

export async function fetchWeekGames(
  seasonYear: number,
  week: number
): Promise<GameInfo[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cached_games')
    .select(
      'id,week,home_team_id,away_team_id,home_team_name,away_team_name,home_score,away_score,status,status_detail,start_time'
    )
    .eq('season_year', seasonYear)
    .eq('week', week)

  return (data ?? []).map((g) => ({
    id: g.id as string,
    week: (g.week ?? 0) as number,
    homeTeamId: g.home_team_id as string,
    awayTeamId: g.away_team_id as string,
    homeTeamName: (g.home_team_name ?? g.home_team_id) as string,
    awayTeamName: (g.away_team_name ?? g.away_team_id) as string,
    homeScore: g.home_score as number | null,
    awayScore: g.away_score as number | null,
    status: g.status as 'scheduled' | 'in_progress' | 'final',
    statusDetail: g.status_detail as string | null,
    startTime: g.start_time as string | null,
  }))
}
