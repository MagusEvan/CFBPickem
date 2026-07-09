'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ffLeagueSettingsSchema, ffScoringSettingsSchema, resolveLeagueSettings } from './settings'
import { eligiblePositionsForSlot, isPlayerLocked } from './roster'
import { currentWeek } from './refresh'
import type { FFDraftState, FFLineupSlot, FFPlayer, FFSlot } from './types'

/** Verify the caller is the pool's commissioner; returns the pool row or an error. */
async function requireCommissioner(poolId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const admin = createAdminClient()
  const { data: pool } = await admin
    .from('pools')
    .select('id, admin_id, game_type, ff_league_settings, ff_scoring_settings')
    .eq('id', poolId)
    .single()

  if (!pool || pool.game_type !== 'ff') return { error: 'Pool not found' as const }
  if (pool.admin_id !== user.id) return { error: 'Only the commissioner can do this' as const }
  return { pool, admin, userId: user.id }
}

export async function updateFfSettings(
  poolId: string,
  leagueSettingsJson: string,
  scoringSettingsJson: string
): Promise<{ error?: string }> {
  const auth = await requireCommissioner(poolId)
  if ('error' in auth) return { error: auth.error }
  const { pool, admin } = auth

  let league, scoring
  try {
    league = ffLeagueSettingsSchema.parse(JSON.parse(leagueSettingsJson))
    scoring = ffScoringSettingsSchema.parse(JSON.parse(scoringSettingsJson))
  } catch {
    return { error: 'Invalid settings' }
  }

  // Roster shape, draft type, and auction budget are locked once the draft starts
  const { data: draftState } = await admin
    .from('ff_draft_state')
    .select('status')
    .eq('pool_id', poolId)
    .single<Pick<FFDraftState, 'status'>>()

  if (draftState && draftState.status !== 'pre_draft') {
    const current = resolveLeagueSettings(pool)
    const rosterChanged = JSON.stringify(current.roster) !== JSON.stringify(league.roster)
    const draftTypeChanged = current.draft.type !== league.draft.type
    const budgetChanged = current.draft.auctionBudget !== league.draft.auctionBudget
    if (rosterChanged || draftTypeChanged || budgetChanged) {
      return { error: 'Roster and draft settings are locked once the draft has started' }
    }
  }

  const { error } = await admin
    .from('pools')
    .update({ ff_league_settings: league, ff_scoring_settings: scoring })
    .eq('id', poolId)

  if (error) return { error: error.message }

  revalidatePath(`/pools/${poolId}`)
  revalidatePath(`/pools/${poolId}/settings`)
  return {}
}

/**
 * Swap the players in two of the caller's lineup slots for a week
 * (either slot may be empty — that's a move rather than a swap).
 *
 * Guards: ownership, current/future week only, position eligibility in both
 * directions, and neither involved player's NFL game may have kicked off.
 */
export async function swapFfLineupSlots(
  poolId: string,
  slotIdA: string,
  slotIdB: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const [poolRes, memberRes, slotsRes] = await Promise.all([
    admin.from('pools').select('id, game_type, season_year, admin_id, ff_league_settings').eq('id', poolId).single(),
    admin.from('pool_members').select('id').eq('pool_id', poolId).eq('user_id', user.id).single(),
    admin.from('ff_lineup_slots').select('*').in('id', [slotIdA, slotIdB]).eq('pool_id', poolId),
  ])

  const pool = poolRes.data
  if (!pool || pool.game_type !== 'ff') return { error: 'Pool not found' }
  const member = memberRes.data
  if (!member) return { error: 'You are not a member of this pool' }

  const slots = (slotsRes.data ?? []) as FFLineupSlot[]
  if (slots.length !== 2) return { error: 'Lineup slot not found' }
  const [a, b] = slots

  const isCommissioner = pool.admin_id === user.id
  if (!isCommissioner && (a.member_id !== member.id || b.member_id !== member.id)) {
    return { error: 'You can only edit your own lineup' }
  }
  if (a.member_id !== b.member_id || a.week !== b.week) {
    return { error: 'Slots must belong to the same lineup' }
  }
  if (a.player_id === null && b.player_id === null) return {}

  // Past weeks are immutable
  const { data: games } = await admin
    .from('ff_nfl_games')
    .select('id, week, status, start_time, home_team_id, away_team_id')
    .eq('season_year', pool.season_year)
    .eq('season_type', 2)
  const week = currentWeek(games ?? [])
  if (week !== null && a.week < week) return { error: 'This week is already final' }

  // Eligibility + lock checks in both directions
  const settings = resolveLeagueSettings(pool)
  const playerIds = [a.player_id, b.player_id].filter((id): id is string => id !== null)
  const { data: playerRows } = await admin.from('ff_players').select('*').in('id', playerIds)
  const players = new Map(((playerRows ?? []) as FFPlayer[]).map((p) => [p.id, p]))

  const startByTeam = new Map<string, string>()
  for (const g of games ?? []) {
    if (g.week !== a.week) continue
    if (g.home_team_id) startByTeam.set(g.home_team_id, g.start_time)
    if (g.away_team_id) startByTeam.set(g.away_team_id, g.start_time)
  }

  const checkMove = (playerId: string | null, dest: FFSlot): string | null => {
    if (!playerId) return null
    const player = players.get(playerId)
    if (!player) return 'Player not found'
    if (!eligiblePositionsForSlot(dest, settings).includes(player.position)) {
      return `${player.name} is not eligible for the ${dest} slot`
    }
    if (dest === 'IR' && !player.injury_status) {
      return `${player.name} is not injured — IR is for injured players only`
    }
    if (isPlayerLocked(player, startByTeam)) {
      return `${player.name}'s game has already started`
    }
    return null
  }

  const moveError = checkMove(a.player_id, b.slot) ?? checkMove(b.player_id, a.slot)
  if (moveError) return { error: moveError }

  // Two updates; unique(pool_id, member_id, week, slot, slot_index) is on the
  // slot columns (not player), so no constraint conflict between the writes.
  const [upA, upB] = await Promise.all([
    admin.from('ff_lineup_slots').update({ player_id: b.player_id }).eq('id', a.id),
    admin.from('ff_lineup_slots').update({ player_id: a.player_id }).eq('id', b.id),
  ])
  if (upA.error || upB.error) return { error: (upA.error ?? upB.error)!.message }

  revalidatePath(`/pools/${poolId}/team`)
  revalidatePath(`/pools/${poolId}/matchups/${a.week}`)
  return {}
}
