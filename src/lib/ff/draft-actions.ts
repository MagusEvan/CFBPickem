'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Pool, PoolMember } from '@/lib/types'
import type { FFDraftState, FFLeagueSettings, FFPlayer, FFDraftPick, FFPosition } from './types'
import { resolveLeagueSettings } from './settings'
import { generateSnakeOrder, getPickInfo, draftRounds, validateFfPick, autopickPlayer } from './draft-engine'
import { autoFillLineup } from './roster'
import { generateRoundRobin } from './schedule'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Snake draft server actions. Concurrency model: ff_draft_picks has
 * unique(pool_id, pick_number) — the pick INSERT is the authoritative claim,
 * so concurrent picks (two managers, or a manager racing a timer autopick)
 * resolve to exactly one winner; losers get a clean error / no-op. State
 * advancement is a conditional UPDATE keyed on the picked number, making it
 * idempotent if two winners' followups interleave.
 */

// --- Shared loading / auth ---

async function loadDraft(poolId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const admin = createAdminClient()
  const [poolRes, stateRes, membersRes] = await Promise.all([
    admin.from('pools').select('*').eq('id', poolId).single(),
    admin.from('ff_draft_state').select('*').eq('pool_id', poolId).single(),
    admin.from('pool_members').select('*').eq('pool_id', poolId)
      .order('draft_position', { ascending: true, nullsFirst: false }),
  ])

  const pool = poolRes.data as Pool | null
  const state = stateRes.data as FFDraftState | null
  const members = (membersRes.data ?? []) as PoolMember[]

  if (!pool || pool.game_type !== 'ff' || !state) return { error: 'Draft not found' as const }

  const callerMember = members.find((m) => m.user_id === user.id)
  if (!callerMember) return { error: 'You are not a member of this pool' as const }

  return { admin, pool, state, members, userId: user.id, callerMember }
}

function revalidateDraft(poolId: string) {
  revalidatePath(`/pools/${poolId}`)
  revalidatePath(`/pools/${poolId}/draft`)
}

function deadlineFrom(settings: FFLeagueSettings): string | null {
  return settings.draft.timerSeconds
    ? new Date(Date.now() + settings.draft.timerSeconds * 1000).toISOString()
    : null
}

// --- Lifecycle ---

export async function startFfDraft(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, state, members, userId } = ctx

  if (pool.admin_id !== userId) return { error: 'Only the commissioner can start the draft' }
  if (state.status !== 'pre_draft') return { error: 'Draft already started' }
  if (members.length < 2) return { error: 'Need at least 2 managers' }

  const settings = resolveLeagueSettings(pool)
  if (settings.draft.type === 'auction') {
    return { error: 'Auction drafts are coming soon — switch to a snake draft in league settings.' }
  }

  // Assign draft positions (random mode, or any member missing a position)
  let ordered = members
  if (pool.draft_order_mode === 'random' || members.some((m) => m.draft_position === null)) {
    const shuffled = [...members].sort(() => Math.random() - 0.5)
    for (let i = 0; i < shuffled.length; i++) {
      await admin.from('pool_members').update({ draft_position: i + 1 }).eq('id', shuffled[i].id)
    }
    ordered = shuffled.map((m, i) => ({ ...m, draft_position: i + 1 }))
  }

  const first = ordered.find((m) => m.draft_position === 1)
  const { error } = await admin
    .from('ff_draft_state')
    .update({
      status: 'in_progress',
      draft_type: settings.draft.type,
      current_round: 1,
      current_pick_number: 1,
      current_member_id: first?.id ?? null,
      timer_seconds: settings.draft.timerSeconds,
      pick_deadline: deadlineFrom(settings),
      updated_at: new Date().toISOString(),
    })
    .eq('pool_id', poolId)
    .eq('status', 'pre_draft') // idempotence under double-click
  if (error) return { error: error.message }

  await admin.from('pools').update({ draft_status: 'in_progress' }).eq('id', poolId)

  revalidateDraft(poolId)
  return {}
}

export async function pauseFfDraft(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, userId } = ctx
  if (pool.admin_id !== userId) return { error: 'Only the commissioner can pause the draft' }

  const { error } = await admin
    .from('ff_draft_state')
    .update({ status: 'paused', pick_deadline: null, updated_at: new Date().toISOString() })
    .eq('pool_id', poolId)
    .eq('status', 'in_progress')
  if (error) return { error: error.message }

  revalidateDraft(poolId)
  return {}
}

export async function resumeFfDraft(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, userId } = ctx
  if (pool.admin_id !== userId) return { error: 'Only the commissioner can resume the draft' }

  const settings = resolveLeagueSettings(pool)
  const { error } = await admin
    .from('ff_draft_state')
    .update({
      status: 'in_progress',
      pick_deadline: deadlineFrom(settings),
      updated_at: new Date().toISOString(),
    })
    .eq('pool_id', poolId)
    .eq('status', 'paused')
  if (error) return { error: error.message }

  revalidateDraft(poolId)
  return {}
}

export async function resetFfDraft(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, userId } = ctx
  if (pool.admin_id !== userId) return { error: 'Only the commissioner can reset the draft' }

  // Wipe everything the draft produced
  await admin.from('ff_matchups').delete().eq('pool_id', poolId)
  await admin.from('ff_lineup_slots').delete().eq('pool_id', poolId)
  await admin.from('ff_rosters').delete().eq('pool_id', poolId)
  await admin.from('ff_auction_bids').delete().eq('pool_id', poolId)
  await admin.from('ff_auction_budgets').delete().eq('pool_id', poolId)
  await admin.from('ff_draft_picks').delete().eq('pool_id', poolId)

  await admin
    .from('ff_draft_state')
    .update({
      status: 'pre_draft',
      current_round: 1,
      current_pick_number: 1,
      current_member_id: null,
      timer_seconds: null,
      pick_deadline: null,
      nominating_member_id: null,
      nomination_number: 1,
      lot_player_id: null,
      lot_high_bid: null,
      lot_high_bidder_id: null,
      lot_deadline: null,
      updated_at: new Date().toISOString(),
    })
    .eq('pool_id', poolId)

  await admin.from('pools').update({ draft_status: 'pre_draft' }).eq('id', poolId)
  await admin.from('pool_members').update({ draft_position: null }).eq('pool_id', poolId)

  revalidateDraft(poolId)
  return {}
}

// --- Picking ---

export async function makeFfPick(
  poolId: string,
  playerId: string,
  onBehalfOfMemberId?: string
): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, state, members, userId, callerMember } = ctx

  if (state.status !== 'in_progress') return { error: 'Draft is not in progress' }

  let target = callerMember
  if (onBehalfOfMemberId && onBehalfOfMemberId !== callerMember.id) {
    if (pool.admin_id !== userId) return { error: 'Only the commissioner can pick for others' }
    const other = members.find((m) => m.id === onBehalfOfMemberId)
    if (!other) return { error: 'Member not found' }
    target = other
  }

  const [{ data: player }, { data: picks }] = await Promise.all([
    admin.from('ff_players').select('*').eq('id', playerId).single(),
    admin.from('ff_draft_picks').select('player_id').eq('pool_id', poolId),
  ])
  if (!player) return { error: 'Player not found' }

  const validation = validateFfPick({
    currentMemberId: state.current_member_id,
    requestingMemberId: target.id,
    playerId,
    draftedPlayerIds: new Set((picks ?? []).map((p) => p.player_id as string)),
  })
  if (!validation.valid) return { error: validation.error }

  return executePick(admin, pool, state, members, target.id, player as FFPlayer, false)
}

/**
 * Idempotent timer enforcement: any member whose client observes an expired
 * pick deadline calls this; exactly one concurrent call wins the pick insert.
 */
export async function enforceFfPickDeadline(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, state, members } = ctx

  if (
    state.status !== 'in_progress' ||
    !state.timer_seconds ||
    !state.pick_deadline ||
    new Date(state.pick_deadline).getTime() > Date.now() ||
    !state.current_member_id
  ) {
    return {} // nothing to enforce (or another client already advanced)
  }

  const settings = resolveLeagueSettings(pool)

  const [{ data: picks }, { data: available }] = await Promise.all([
    admin.from('ff_draft_picks').select('member_id, player_id, player_position').eq('pool_id', poolId),
    // No row limit: K/DST rank last by design and must stay reachable for
    // the constrained (fill-required-slots) autopick path (~1,000 rows).
    admin
      .from('ff_players')
      .select('*')
      .eq('active', true)
      .order('default_rank', { ascending: true, nullsFirst: false }),
  ])

  const allPicks = (picks ?? []) as Pick<FFDraftPick, 'member_id' | 'player_id' | 'player_position'>[]
  const draftedIds = new Set(allPicks.map((p) => p.player_id))
  const undrafted = ((available ?? []) as FFPlayer[]).filter((p) => !draftedIds.has(p.id))

  const memberPositions = allPicks
    .filter((p) => p.member_id === state.current_member_id)
    .map((p) => p.player_position as FFPosition)
  const totalRounds = draftRounds(settings)
  const remainingPicks = totalRounds - memberPositions.length

  const player = autopickPlayer(undrafted, memberPositions, remainingPicks, settings)
  if (!player) return { error: 'No players available to autopick' }

  const result = await executePick(admin, pool, state, members, state.current_member_id, player, true)
  // A concurrent enforcement/pick already won — that's success, not an error
  if (result.error?.includes('already')) return {}
  return result
}

/** Insert the pick (authoritative claim via unique pick_number) and advance. */
async function executePick(
  admin: Admin,
  pool: Pool,
  state: FFDraftState,
  members: PoolMember[],
  memberId: string,
  player: FFPlayer,
  auto: boolean
): Promise<{ error?: string }> {
  const { error: pickError } = await admin.from('ff_draft_picks').insert({
    pool_id: pool.id,
    member_id: memberId,
    round: state.current_round,
    pick_number: state.current_pick_number,
    player_id: player.id,
    player_name: player.name,
    player_position: player.position,
    auto,
  })
  if (pickError) {
    // 23505 = unique violation: pick_number (lost the race) or player (taken)
    if (pickError.code === '23505') return { error: 'This pick was already made — refresh and try again.' }
    return { error: pickError.message }
  }

  const settings = resolveLeagueSettings(pool)
  const totalPicks = members.length * draftRounds(settings)
  const nextPickNumber = state.current_pick_number + 1

  if (nextPickNumber > totalPicks) {
    await completeDraft(admin, pool, members, settings, state.current_pick_number)
  } else {
    const order = generateSnakeOrder({ managerCount: members.length, numRounds: draftRounds(settings) })
    const next = getPickInfo(order, nextPickNumber)!
    const nextMember = members.find((m) => m.draft_position === next.managerPosition)
    await admin
      .from('ff_draft_state')
      .update({
        current_round: next.round,
        current_pick_number: nextPickNumber,
        current_member_id: nextMember?.id ?? null,
        pick_deadline: state.timer_seconds
          ? new Date(Date.now() + state.timer_seconds * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', pool.id)
      .eq('current_pick_number', state.current_pick_number) // idempotent advance
  }

  revalidateDraft(pool.id)
  return {}
}

// --- Completion: rosters, initial lineups, season schedule ---

async function completeDraft(
  admin: Admin,
  pool: Pool,
  members: PoolMember[],
  settings: FFLeagueSettings,
  finalPickNumber: number
) {
  await admin
    .from('ff_draft_state')
    .update({
      status: 'completed',
      current_pick_number: finalPickNumber + 1,
      current_member_id: null,
      pick_deadline: null,
      updated_at: new Date().toISOString(),
    })
    .eq('pool_id', pool.id)
    .eq('current_pick_number', finalPickNumber)

  await admin.from('pools').update({ draft_status: 'completed' }).eq('id', pool.id)

  const { data: picks } = await admin
    .from('ff_draft_picks')
    .select('*')
    .eq('pool_id', pool.id)
    .order('pick_number')
  const allPicks = (picks ?? []) as FFDraftPick[]

  // Rosters
  const rosterRows = allPicks.map((p) => ({
    pool_id: pool.id,
    member_id: p.member_id,
    player_id: p.player_id,
    acquired_via: 'draft' as const,
    acquisition_cost: p.price,
  }))
  if (rosterRows.length > 0) {
    await admin.from('ff_rosters').upsert(rosterRows, { onConflict: 'pool_id,player_id' })
  }

  // Initial week-1 lineups (players in draft order ≈ best first)
  const lineupRows = members.flatMap((m) => {
    const players = allPicks
      .filter((p) => p.member_id === m.id)
      .map((p) => ({ id: p.player_id, position: p.player_position }))
    return autoFillLineup(players, settings).map((a) => ({
      pool_id: pool.id,
      member_id: m.id,
      week: 1,
      slot: a.slot,
      slot_index: a.slot_index,
      player_id: a.player_id,
    }))
  })
  if (lineupRows.length > 0) {
    await admin
      .from('ff_lineup_slots')
      .upsert(lineupRows, { onConflict: 'pool_id,member_id,week,slot,slot_index' })
  }

  // Regular-season schedule (ordered by draft position for determinism)
  const memberIds = [...members]
    .sort((a, b) => (a.draft_position ?? 0) - (b.draft_position ?? 0))
    .map((m) => m.id)
  const matchups = generateRoundRobin(memberIds, settings.season.regularSeasonWeeks)
  if (matchups.length > 0) {
    await admin.from('ff_matchups').upsert(
      matchups.map((m) => ({ pool_id: pool.id, ...m, is_playoff: false })),
      { onConflict: 'pool_id,week,home_member_id' }
    )
  }
}

// --- Undo (commissioner) ---

export async function undoFfPick(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, state, members, userId } = ctx
  if (pool.admin_id !== userId) return { error: 'Only the commissioner can undo picks' }

  const { data: lastPick } = await admin
    .from('ff_draft_picks')
    .select('*')
    .eq('pool_id', poolId)
    .order('pick_number', { ascending: false })
    .limit(1)
    .single<FFDraftPick>()
  if (!lastPick) return { error: 'No picks to undo' }

  await admin.from('ff_draft_picks').delete().eq('id', lastPick.id)

  // Undoing out of a completed draft reverts everything completion created
  if (state.status === 'completed') {
    await admin.from('ff_matchups').delete().eq('pool_id', poolId)
    await admin.from('ff_lineup_slots').delete().eq('pool_id', poolId)
    await admin.from('ff_rosters').delete().eq('pool_id', poolId)
    await admin.from('pools').update({ draft_status: 'in_progress' }).eq('id', poolId)
  }

  const settings = resolveLeagueSettings(pool)
  const order = generateSnakeOrder({ managerCount: members.length, numRounds: draftRounds(settings) })
  const pickInfo = getPickInfo(order, lastPick.pick_number)
  if (!pickInfo) return { error: 'Invalid pick number' }
  const memberForPick = members.find((m) => m.draft_position === pickInfo.managerPosition)

  await admin
    .from('ff_draft_state')
    .update({
      status: state.status === 'paused' ? 'paused' : 'in_progress',
      current_round: pickInfo.round,
      current_pick_number: lastPick.pick_number,
      current_member_id: memberForPick?.id ?? null,
      pick_deadline:
        state.status !== 'paused' && state.timer_seconds
          ? new Date(Date.now() + state.timer_seconds * 1000).toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('pool_id', poolId)

  revalidateDraft(poolId)
  return {}
}
