'use server'

// Manual NFL data refresh triggers for /admin/nfl. These intentionally
// bypass claimRefresh (a forced refresh is the point) but stamp the
// data_refresh row afterwards so the lazy path doesn't immediately
// re-fetch and the freshness display stays truthful. Each action does one
// resource (or one week) per call to stay under serverless timeouts.

import { revalidatePath } from 'next/cache'
import { requireSiteAdmin } from './auth'
import { refreshPlayerCatalog, refreshSchedule, refreshWeekStats } from '@/lib/ff/refresh'
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

async function stampRefreshed(admin: Admin, resource: string): Promise<void> {
  await admin
    .from('data_refresh')
    .upsert({ resource, last_refreshed_at: new Date().toISOString() })
}

export async function adminRefreshPlayerCatalog(
  seasonYear: number
): Promise<{ error?: string; players?: number }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }
  const { admin } = auth

  try {
    await refreshPlayerCatalog(admin)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Catalog refresh failed' }
  }
  await stampRefreshed(admin, `ff_players:${seasonYear}`)

  const { count } = await admin
    .from('ff_players')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
  revalidatePath('/admin/nfl')
  return { players: count ?? 0 }
}

export async function adminRefreshSchedule(
  seasonYear: number
): Promise<{ error?: string; games?: number }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }
  const { admin } = auth

  try {
    await refreshSchedule(admin, seasonYear)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Schedule refresh failed' }
  }
  await stampRefreshed(admin, `ff_schedule:${seasonYear}`)

  const { count } = await admin
    .from('ff_nfl_games')
    .select('id', { count: 'exact', head: true })
    .eq('season_year', seasonYear)
    .eq('season_type', 2)
  revalidatePath('/admin/nfl')
  return { games: count ?? 0 }
}

export async function adminRefreshWeekStats(
  seasonYear: number,
  week: number
): Promise<{ error?: string; statsRows?: number }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }
  const { admin } = auth

  if (!Number.isInteger(week) || week < 1 || week > 18) {
    return { error: 'Week must be 1–18' }
  }

  try {
    await refreshWeekStats(admin, seasonYear, week)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Stats refresh failed' }
  }
  await stampRefreshed(admin, `ff_stats:${seasonYear}`)

  const { count } = await admin
    .from('ff_player_stats')
    .select('player_id', { count: 'exact', head: true })
    .eq('season_year', seasonYear)
    .eq('week', week)
  revalidatePath('/admin/nfl')
  return { statsRows: count ?? 0 }
}
