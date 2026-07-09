'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  compositeRank,
  recomputeEffectiveRanks,
  refreshRankingsFromSources,
  type RankingRefreshSummary,
} from './rankings'

async function requireSiteAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('is_site_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_site_admin) return { error: 'Site admin access required' as const }
  return { admin }
}

/** Pull fresh ranks from ESPN, Yahoo, Sleeper, and FantasyPros. */
export async function refreshFfRankings(
  seasonYear: number
): Promise<{ error?: string; summary?: RankingRefreshSummary }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }

  try {
    const summary = await refreshRankingsFromSources(auth.admin, seasonYear)
    revalidatePath('/admin/rankings')
    return { summary }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Ranking refresh failed' }
  }
}

export interface PlayerRankInput {
  espn: number | null
  yahoo: number | null
  sleeper: number | null
  fantasypros: number | null
  /** Manual composite override; null clears it (fall back to calculated) */
  compositeOverride: number | null
}

/** Manually set a player's per-source ranks; recomputes composite + draft order. */
export async function updateFfPlayerRanks(
  playerId: string,
  ranks: PlayerRankInput
): Promise<{ error?: string; composite?: number | null }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }
  const { admin } = auth

  const clean = (v: number | null) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : null
  const rank_espn = clean(ranks.espn)
  const rank_yahoo = clean(ranks.yahoo)
  const rank_sleeper = clean(ranks.sleeper)
  const rank_fantasypros = clean(ranks.fantasypros)
  const rank_composite = compositeRank([rank_espn, rank_yahoo, rank_sleeper, rank_fantasypros])
  const o = ranks.compositeOverride
  const rank_composite_override =
    typeof o === 'number' && Number.isFinite(o) && o >= 1 ? Math.round(o * 100) / 100 : null

  const { error } = await admin
    .from('ff_players')
    .update({
      rank_espn,
      rank_yahoo,
      rank_sleeper,
      rank_fantasypros,
      rank_composite,
      rank_composite_override,
    })
    .eq('id', playerId)
  if (error) return { error: error.message }

  await recomputeEffectiveRanks(admin)
  revalidatePath('/admin/rankings')
  return { composite: rank_composite_override ?? rank_composite }
}
