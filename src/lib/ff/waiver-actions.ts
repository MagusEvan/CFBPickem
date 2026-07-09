'use server'

// Free agency + waiver server actions. The processing core (also invoked
// lazily from page loads) lives in waiver-processing.ts.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLeagueSettings, totalRosterSpots } from './settings'
import {
  type Admin,
  type DropValidation,
  assignToLineups,
  clearFromLineups,
  ensureWaiverPriority,
  ensureWaiverState,
  getSeasonWeek,
  isOnWaivers,
  logTransaction,
  playerDetail,
  runWaiverProcessing,
  validateDrop,
} from './waiver-processing'
import type { FFLeagueSettings, FFPlayer } from './types'

interface TransactionCtx {
  admin: Admin
  pool: { id: string; season_year: number; admin_id: string }
  settings: FFLeagueSettings
  member: { id: string }
  isCommissioner: boolean
}

async function loadCtx(poolId: string): Promise<TransactionCtx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const [poolRes, memberRes] = await Promise.all([
    admin
      .from('pools')
      .select('id, game_type, season_year, admin_id, draft_status, ff_league_settings')
      .eq('id', poolId)
      .single(),
    admin.from('pool_members').select('id').eq('pool_id', poolId).eq('user_id', user.id).single(),
  ])

  const pool = poolRes.data
  if (!pool || pool.game_type !== 'ff') return { error: 'Pool not found' }
  if (!memberRes.data) return { error: 'You are not a member of this pool' }
  if (pool.draft_status !== 'completed') return { error: 'Transactions open after the draft' }

  return {
    admin,
    pool,
    settings: resolveLeagueSettings(pool),
    member: memberRes.data,
    isCommissioner: pool.admin_id === user.id,
  }
}

function revalidateTransactions(poolId: string) {
  revalidatePath(`/pools/${poolId}/players`)
  revalidatePath(`/pools/${poolId}/team`)
  revalidatePath(`/pools/${poolId}/transactions`)
}

/** Put a just-dropped player on waivers until the next processing time. */
async function lockToWaivers(
  admin: Admin,
  poolId: string,
  playerId: string,
  settings: FFLeagueSettings
) {
  if (settings.waivers.type === 'none') return
  const state = await ensureWaiverState(admin, poolId, settings)
  await admin.from('ff_player_waivers').upsert(
    { pool_id: poolId, player_id: playerId, clears_at: state.next_process_at },
    { onConflict: 'pool_id,player_id' }
  )
}

/** Instant free-agent pickup (player must have cleared waivers). */
export async function addFfFreeAgent(
  poolId: string,
  addPlayerId: string,
  dropPlayerId: string | null
): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, settings, member } = ctx

  const [playerRes, ownerRes, rosterRes] = await Promise.all([
    admin.from('ff_players').select('*').eq('id', addPlayerId).single(),
    admin
      .from('ff_rosters')
      .select('id')
      .eq('pool_id', poolId)
      .eq('player_id', addPlayerId)
      .maybeSingle(),
    admin.from('ff_rosters').select('id').eq('pool_id', poolId).eq('member_id', member.id),
  ])

  const player = playerRes.data as FFPlayer | null
  if (!player) return { error: 'Player not found' }
  if (ownerRes.data) return { error: 'That player is already rostered' }
  if (settings.waivers.type !== 'none' && (await isOnWaivers(admin, poolId, addPlayerId))) {
    return { error: 'That player is on waivers — submit a claim instead' }
  }

  const week = await getSeasonWeek(admin, pool.season_year)
  let dropped: DropValidation | null = null
  if (dropPlayerId) {
    const v = await validateDrop(admin, poolId, member.id, dropPlayerId, pool.season_year, week)
    if ('error' in v) return { error: v.error }
    dropped = v
  } else if ((rosterRes.data?.length ?? 0) >= totalRosterSpots(settings)) {
    return { error: 'Your roster is full — choose a player to drop' }
  }

  // Apply: drop first (frees a lineup slot), then add. The unique
  // (pool_id, player_id) constraint settles concurrent add races.
  if (dropped) {
    await admin.from('ff_rosters').delete().eq('id', dropped.entry.id)
    await clearFromLineups(admin, poolId, dropped.player.id, week)
  }

  const { error: insertError } = await admin.from('ff_rosters').insert({
    pool_id: poolId,
    member_id: member.id,
    player_id: addPlayerId,
    acquired_via: 'free_agent',
  })
  if (insertError) {
    return {
      error: insertError.code === '23505'
        ? 'Another manager just added that player'
        : insertError.message,
    }
  }

  await assignToLineups(admin, poolId, member.id, player, settings, week)
  if (dropped) await lockToWaivers(admin, poolId, dropped.player.id, settings)
  await logTransaction(admin, poolId, member.id, 'free_agent_add', {
    add: playerDetail(player),
    ...(dropped ? { drop: playerDetail(dropped.player) } : {}),
  })

  revalidateTransactions(poolId)
  return {}
}

/** Drop a player outright (they go on waivers until the next processing). */
export async function dropFfPlayer(poolId: string, playerId: string): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, settings, member } = ctx

  const week = await getSeasonWeek(admin, pool.season_year)
  const v = await validateDrop(admin, poolId, member.id, playerId, pool.season_year, week)
  if ('error' in v) return { error: v.error }

  await admin.from('ff_rosters').delete().eq('id', v.entry.id)
  await clearFromLineups(admin, poolId, playerId, week)
  await lockToWaivers(admin, poolId, playerId, settings)
  await logTransaction(admin, poolId, member.id, 'drop', { drop: playerDetail(v.player) })

  revalidateTransactions(poolId)
  return {}
}

/** Submit a waiver claim (FAAB bid or priority-based, per league settings). */
export async function submitFfWaiverClaim(
  poolId: string,
  addPlayerId: string,
  dropPlayerId: string | null,
  bid: number
): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, settings, member } = ctx

  if (settings.waivers.type === 'none') return { error: 'This league does not use waivers' }
  if (settings.waivers.type === 'faab') {
    if (!Number.isInteger(bid) || bid < 0) return { error: 'Bid must be a whole number' }
    const priority = await ensureWaiverPriority(admin, poolId)
    const mine = priority.find((r) => r.member_id === member.id)
    const remaining = settings.waivers.faabBudget - (mine?.faab_spent ?? 0)
    if (bid > remaining) return { error: `Bid exceeds your remaining FAAB ($${remaining})` }
  }

  const [playerRes, ownerRes, claimsRes] = await Promise.all([
    admin.from('ff_players').select('id').eq('id', addPlayerId).single(),
    admin
      .from('ff_rosters')
      .select('id')
      .eq('pool_id', poolId)
      .eq('player_id', addPlayerId)
      .maybeSingle(),
    admin
      .from('ff_waiver_claims')
      .select('add_player_id, claim_order')
      .eq('pool_id', poolId)
      .eq('member_id', member.id)
      .eq('status', 'pending'),
  ])

  if (!playerRes.data) return { error: 'Player not found' }
  if (ownerRes.data) return { error: 'That player is already rostered' }
  const myClaims = claimsRes.data ?? []
  if (myClaims.some((c) => c.add_player_id === addPlayerId)) {
    return { error: 'You already have a pending claim for that player' }
  }
  if (dropPlayerId) {
    const { data: owned } = await admin
      .from('ff_rosters')
      .select('id')
      .eq('pool_id', poolId)
      .eq('member_id', member.id)
      .eq('player_id', dropPlayerId)
      .maybeSingle()
    if (!owned) return { error: 'The player you offered to drop is not on your roster' }
  }

  const { error } = await admin.from('ff_waiver_claims').insert({
    pool_id: poolId,
    member_id: member.id,
    add_player_id: addPlayerId,
    drop_player_id: dropPlayerId,
    bid: settings.waivers.type === 'faab' ? bid : 0,
    claim_order: myClaims.reduce((max, c) => Math.max(max, c.claim_order), 0) + 1,
  })
  if (error) return { error: error.message }

  revalidatePath(`/pools/${poolId}/players`)
  return {}
}

export async function cancelFfWaiverClaim(
  poolId: string,
  claimId: string
): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, member } = ctx

  const { data } = await admin
    .from('ff_waiver_claims')
    .update({ status: 'cancelled' })
    .eq('id', claimId)
    .eq('pool_id', poolId)
    .eq('member_id', member.id)
    .eq('status', 'pending')
    .select('id')
  if (!data || data.length === 0) return { error: 'Claim not found' }

  revalidatePath(`/pools/${poolId}/players`)
  return {}
}

/** Reorder the caller's pending claims (their tiebreak among own claims). */
export async function reorderFfWaiverClaims(
  poolId: string,
  orderedClaimIds: string[]
): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, member } = ctx

  await Promise.all(
    orderedClaimIds.map((id, i) =>
      admin
        .from('ff_waiver_claims')
        .update({ claim_order: i + 1 })
        .eq('id', id)
        .eq('pool_id', poolId)
        .eq('member_id', member.id)
        .eq('status', 'pending')
    )
  )

  revalidatePath(`/pools/${poolId}/players`)
  return {}
}

/** Commissioner: process all pending claims immediately. */
export async function processFfWaiversNow(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, settings, isCommissioner } = ctx
  if (!isCommissioner) return { error: 'Only the commissioner can process waivers' }
  if (settings.waivers.type === 'none') return { error: 'This league does not use waivers' }

  await ensureWaiverState(admin, poolId, settings)
  const now = new Date().toISOString()
  await admin.from('ff_waiver_state').update({ next_process_at: now }).eq('pool_id', poolId)
  await runWaiverProcessing(admin, pool, settings, now)

  revalidateTransactions(poolId)
  return {}
}
