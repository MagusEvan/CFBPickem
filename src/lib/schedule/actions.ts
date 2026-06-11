'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/pools/queries'

export async function refreshSchedule(poolId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const pool = await getPool(poolId)
  if (!pool) return { error: 'Pool not found' }
  if (pool.admin_id !== user.id) return { error: 'Only the league admin can refresh' }

  const admin = createAdminClient()

  let result: { error?: string }
  if (pool.game_type === 'world_cup') {
    result = await refreshWcGames(admin, pool.season_year)
  } else {
    result = await refreshCfbGames(admin, pool.season_year)
  }

  // Bust the page cache so all users see fresh data
  revalidatePath(`/pools/${poolId}/schedule`)
  revalidatePath(`/pools/${poolId}/standings`)

  return result
}

async function refreshWcGames(
  admin: ReturnType<typeof createAdminClient>,
  seasonYear: number
): Promise<{ error?: string }> {
  try {
    const { getWorldCupProvider } = await import('@/lib/data-providers/world-cup/provider')
    const provider = getWorldCupProvider()
    const games = await provider.getAllGames(seasonYear)

    const rows = games.map((g) => ({
      id: g.id,
      season_year: seasonYear,
      week: null,
      home_team_id: g.homeTeam.id,
      away_team_id: g.awayTeam.id,
      home_score: g.homeTeam.score,
      away_score: g.awayTeam.score,
      status: g.status,
      status_detail: g.statusDetail,
      start_time: g.startTime,
      venue: g.venue,
      game_type: 'world_cup' as const,
      stage: g.stage,
      is_overtime: g.isOvertime,
      is_shootout: g.isShootout,
      home_penalty_score: g.homePenaltyScore,
      away_penalty_score: g.awayPenaltyScore,
      manual_entry: false,
      broadcasts: g.broadcasts.length > 0 ? g.broadcasts : null,
      fetched_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      const { error } = await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
      if (error) return { error: `DB upsert failed: ${error.message}` }
    }
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to refresh' }
  }
}

async function refreshCfbGames(
  admin: ReturnType<typeof createAdminClient>,
  seasonYear: number
): Promise<{ error?: string }> {
  try {
    const { getDataProvider } = await import('@/lib/data-providers')
    const provider = getDataProvider()

    // Refresh all 15 weeks
    for (let week = 1; week <= 15; week++) {
      const games = await provider.getGamesForWeek(seasonYear, week)
      const rows = games.map((g) => ({
        id: g.id,
        season_year: g.seasonYear,
        week: g.week,
        home_team_id: g.homeTeam.id,
        away_team_id: g.awayTeam.id,
        home_score: g.homeTeam.score,
        away_score: g.awayTeam.score,
        status: g.status,
        status_detail: g.statusDetail,
        start_time: g.startTime,
        venue: g.venue,
        broadcasts: g.broadcasts.length > 0 ? g.broadcasts : null,
        fetched_at: new Date().toISOString(),
      }))

      if (rows.length > 0) {
        const { error } = await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
        if (error) return { error: `DB upsert failed: ${error.message}` }
      }
    }
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to refresh' }
  }
}
