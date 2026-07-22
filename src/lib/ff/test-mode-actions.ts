'use server'

import { revalidatePath } from 'next/cache'
import { requireSiteAdmin } from '@/lib/admin/auth'
import { refreshWeekStats } from './refresh'
import { resolveBestBallSettings } from './settings'
import type { Pool } from '@/lib/types'

/**
 * Site-admin-only best ball test mode: replay a past season week by week.
 * week = 1..19 (19 = season complete); null disables test mode.
 */
export async function setBestBallSimulatedWeek(
  poolId: string,
  week: number | null
): Promise<{ error?: string }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }
  const { admin } = auth

  if (week !== null && (!Number.isInteger(week) || week < 1 || week > 19)) {
    return { error: 'Simulated week must be 1–19' }
  }

  const { data: pool } = await admin
    .from('pools')
    .select('*')
    .eq('id', poolId)
    .single<Pool>()
  if (!pool) return { error: 'Pool not found' }
  if (pool.game_type !== 'ff_bestball') return { error: 'Test mode is best ball only' }

  const settings = resolveBestBallSettings(pool)
  const oldSim = settings.test?.simulatedWeek ?? null

  // Rewinding (or disabling) can invalidate the playoff bracket — delete it
  // and let ensurePlayoffs regenerate from the new effective week.
  if (week === null || (oldSim !== null && week < oldSim)) {
    await admin.from('ff_matchups').delete().eq('pool_id', poolId).eq('is_playoff', true)
  }

  if (week === null) delete settings.test
  else settings.test = { simulatedWeek: week }

  const { error } = await admin
    .from('pools')
    .update({ ff_league_settings: settings })
    .eq('id', poolId)
  if (error) return { error: error.message }

  for (const path of ['', '/standings', '/matchups', '/team', '/settings']) {
    revalidatePath(`/pools/${poolId}${path}`)
  }
  return {}
}

/**
 * Backfill one week of NFL stats (idempotent, ≤16 ESPN fetches). The client
 * loops weeks 1..18 one call at a time to stay under serverless timeouts.
 */
export async function backfillFfStatsWeek(
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

  const { count } = await admin
    .from('ff_player_stats')
    .select('player_id', { count: 'exact', head: true })
    .eq('season_year', seasonYear)
    .eq('week', week)
  return { statsRows: count ?? 0 }
}
