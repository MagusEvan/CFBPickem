'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Pool, PoolMember } from '@/lib/types'
import type { FFDraftState, FFLeagueSettings, FFPlayer, FFDraftPick, FFPosition } from './types'
import { resolveLeagueSettings, resolveBestBallSettings } from './settings'
import { isFfFamily } from '@/lib/games/registry'
import {
  generateSnakeOrder,
  getPickInfo,
  draftRounds,
  validateFfPick,
  autopickPlayer,
  maxBid,
  nextNominatorId,
} from './draft-engine'
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

  if (!pool || !isFfFamily(pool.game_type) || !state) return { error: 'Draft not found' as const }

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
  const isAuction = settings.draft.type === 'auction'
  if (isAuction && settings.draft.auctionBudget < draftRounds(settings)) {
    return { error: 'Auction budget must cover at least $1 per roster spot' }
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
      // Snake: first picker on the clock. Auction: first nominator instead.
      current_member_id: isAuction ? null : first?.id ?? null,
      nominating_member_id: isAuction ? first?.id ?? null : null,
      nomination_number: 1,
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
    .update({
      status: 'paused',
      pick_deadline: null,
      lot_deadline: null,
      updated_at: new Date().toISOString(),
    })
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
  const state = ctx.state
  const lotOpen = state.draft_type === 'auction' && state.lot_player_id !== null
  const { error } = await admin
    .from('ff_draft_state')
    .update({
      status: 'in_progress',
      // An open lot resumes with a fresh bid clock; otherwise the pick/
      // nomination timer restarts (if the draft is timed at all)
      pick_deadline: lotOpen ? null : deadlineFrom(settings),
      lot_deadline: lotOpen
        ? new Date(Date.now() + settings.draft.auctionBidSeconds * 1000).toISOString()
        : null,
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

// --- Auction ---
//
// Lot state on ff_draft_state is authoritative; ff_auction_bids is an
// advisory log for the live bid feed. Budgets are derived from pick prices
// (single source of truth — undo just deletes the pick). Concurrency:
// bids are conditional UPDATEs (must beat lot_high_bid), and the award
// insert claims unique(pool_id, pick_number) exactly like snake picks.

interface AuctionMemberState {
  rosterCount: number
  spent: number
}

function auctionMemberStates(
  members: PoolMember[],
  picks: Pick<FFDraftPick, 'member_id' | 'price'>[]
): Map<string, AuctionMemberState> {
  const byId = new Map<string, AuctionMemberState>(
    members.map((m) => [m.id, { rosterCount: 0, spent: 0 }])
  )
  for (const p of picks) {
    const s = byId.get(p.member_id)
    if (!s) continue
    s.rosterCount++
    s.spent += p.price ?? 0
  }
  return byId
}

function memberMaxBid(
  memberId: string,
  states: Map<string, AuctionMemberState>,
  settings: FFLeagueSettings
): number {
  const s = states.get(memberId) ?? { rosterCount: 0, spent: 0 }
  const openSpots = draftRounds(settings) - s.rosterCount
  return maxBid(settings.draft.auctionBudget - s.spent, openSpots)
}

async function loadAuctionPicks(admin: Admin, poolId: string) {
  const { data } = await admin
    .from('ff_draft_picks')
    .select('member_id, player_id, player_position, price')
    .eq('pool_id', poolId)
  return (data ?? []) as Pick<FFDraftPick, 'member_id' | 'player_id' | 'player_position' | 'price'>[]
}

/** Open a lot: nominator (or commissioner) puts a player up at $1. */
export async function nominateFfPlayer(poolId: string, playerId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, state, members, userId, callerMember } = ctx

  if (state.status !== 'in_progress' || state.draft_type !== 'auction') {
    return { error: 'Auction is not in progress' }
  }
  if (state.lot_player_id) return { error: 'A player is already up for bid' }
  if (!state.nominating_member_id) return { error: 'No nominator set' }
  if (callerMember.id !== state.nominating_member_id && pool.admin_id !== userId) {
    return { error: 'It is not your turn to nominate' }
  }

  const settings = resolveLeagueSettings(pool)
  const [{ data: player }, picks] = await Promise.all([
    admin.from('ff_players').select('*').eq('id', playerId).single(),
    loadAuctionPicks(admin, poolId),
  ])
  if (!player) return { error: 'Player not found' }
  if (picks.some((p) => p.player_id === playerId)) {
    return { error: 'This player has already been drafted' }
  }

  const states = auctionMemberStates(members, picks)
  if (memberMaxBid(state.nominating_member_id, states, settings) < 1) {
    return { error: 'The nominating manager has no roster spots left' }
  }

  return openLot(admin, pool, state, settings, player as FFPlayer, state.nominating_member_id)
}

/** Conditional lot open — loses cleanly if another nomination landed first. */
async function openLot(
  admin: Admin,
  pool: Pool,
  state: FFDraftState,
  settings: FFLeagueSettings,
  player: FFPlayer,
  nominatorId: string
): Promise<{ error?: string }> {
  const { data: updated } = await admin
    .from('ff_draft_state')
    .update({
      lot_player_id: player.id,
      lot_high_bid: 1,
      lot_high_bidder_id: nominatorId,
      lot_deadline: new Date(Date.now() + settings.draft.auctionBidSeconds * 1000).toISOString(),
      pick_deadline: null,
      updated_at: new Date().toISOString(),
    })
    .eq('pool_id', pool.id)
    .eq('nomination_number', state.nomination_number)
    .is('lot_player_id', null)
    .select('pool_id')
  if (!updated || updated.length === 0) {
    return { error: 'Another nomination just came in — refresh and try again.' }
  }

  await admin.from('ff_auction_bids').insert({
    pool_id: pool.id,
    nomination_number: state.nomination_number,
    member_id: nominatorId,
    player_id: player.id,
    amount: 1,
  })

  revalidateDraft(pool.id)
  return {}
}

export async function placeFfBid(poolId: string, amount: number): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, state, members, callerMember } = ctx

  if (state.status !== 'in_progress' || state.draft_type !== 'auction' || !state.lot_player_id) {
    return { error: 'No player is up for bid' }
  }
  if (state.lot_deadline && new Date(state.lot_deadline).getTime() <= Date.now()) {
    return { error: 'Bidding on this player has closed' }
  }
  if (!Number.isInteger(amount) || amount < 1) return { error: 'Bids must be whole dollars' }
  if (state.lot_high_bidder_id === callerMember.id) {
    return { error: 'You are already the high bidder' }
  }

  const settings = resolveLeagueSettings(pool)
  const picks = await loadAuctionPicks(admin, poolId)
  const states = auctionMemberStates(members, picks)
  const myMax = memberMaxBid(callerMember.id, states, settings)
  if (myMax < 1) return { error: 'Your roster is full' }
  if (amount > myMax) return { error: `Your max bid is $${myMax}` }

  // Must beat the current high bid; the .lt guard resolves concurrent bids
  const { data: updated } = await admin
    .from('ff_draft_state')
    .update({
      lot_high_bid: amount,
      lot_high_bidder_id: callerMember.id,
      // Every bid resets the clock (soft close)
      lot_deadline: new Date(Date.now() + settings.draft.auctionBidSeconds * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('pool_id', poolId)
    .eq('nomination_number', state.nomination_number)
    .eq('lot_player_id', state.lot_player_id)
    .lt('lot_high_bid', amount)
    .select('pool_id')
  if (!updated || updated.length === 0) {
    return { error: 'Someone bid higher first — raise again.' }
  }

  await admin.from('ff_auction_bids').insert({
    pool_id: poolId,
    nomination_number: state.nomination_number,
    member_id: callerMember.id,
    player_id: state.lot_player_id,
    amount,
  })

  revalidateDraft(poolId)
  return {}
}

/**
 * Idempotent lazy lot close: any member whose client observes an expired
 * lot deadline calls this. The pick insert (unique pick_number) picks
 * exactly one winner among concurrent calls.
 */
export async function closeFfLot(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, state, members } = ctx

  if (
    state.status !== 'in_progress' ||
    state.draft_type !== 'auction' ||
    !state.lot_player_id ||
    !state.lot_high_bidder_id ||
    !state.lot_deadline ||
    new Date(state.lot_deadline).getTime() > Date.now()
  ) {
    return {} // nothing to close (or another client already advanced)
  }

  const { data: player } = await admin
    .from('ff_players')
    .select('*')
    .eq('id', state.lot_player_id)
    .single()
  if (!player) return { error: 'Player not found' }

  const { error: pickError } = await admin.from('ff_draft_picks').insert({
    pool_id: poolId,
    member_id: state.lot_high_bidder_id,
    round: null,
    pick_number: state.nomination_number,
    player_id: player.id,
    player_name: (player as FFPlayer).name,
    player_position: (player as FFPlayer).position,
    price: state.lot_high_bid,
    auto: false,
  })
  // Lost the close race (or player somehow taken) — treat as already done
  if (pickError) {
    if (pickError.code === '23505') return {}
    return { error: pickError.message }
  }

  const settings = resolveLeagueSettings(pool)
  const rounds = draftRounds(settings)
  const totalPicks = members.length * rounds

  if (state.nomination_number >= totalPicks) {
    await admin
      .from('ff_draft_state')
      .update({
        status: 'completed',
        nominating_member_id: null,
        lot_player_id: null,
        lot_high_bid: null,
        lot_high_bidder_id: null,
        lot_deadline: null,
        pick_deadline: null,
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', poolId)
      .eq('nomination_number', state.nomination_number)
    await admin.from('pools').update({ draft_status: 'completed' }).eq('id', poolId)
    await buildSeasonArtifacts(admin, pool, members, settings)
  } else {
    const picks = await loadAuctionPicks(admin, poolId)
    const states = auctionMemberStates(members, picks)
    const counts = new Map([...states].map(([id, s]) => [id, s.rosterCount]))
    const nextNom = nextNominatorId(
      members.map((m) => m.id),
      counts,
      state.nomination_number + 1,
      rounds
    )
    await admin
      .from('ff_draft_state')
      .update({
        nomination_number: state.nomination_number + 1,
        nominating_member_id: nextNom,
        lot_player_id: null,
        lot_high_bid: null,
        lot_high_bidder_id: null,
        lot_deadline: null,
        pick_deadline: deadlineFrom(settings),
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', poolId)
      .eq('nomination_number', state.nomination_number) // idempotent advance
  }

  revalidateDraft(poolId)
  return {}
}

/**
 * Idempotent nomination-timer enforcement: auto-nominates the best available
 * player (by the same constrained autopick logic) for the manager on the
 * clock when their nomination deadline expires.
 */
export async function enforceFfNominationDeadline(poolId: string): Promise<{ error?: string }> {
  const ctx = await loadDraft(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, state } = ctx

  if (
    state.status !== 'in_progress' ||
    state.draft_type !== 'auction' ||
    state.lot_player_id !== null ||
    !state.timer_seconds ||
    !state.pick_deadline ||
    new Date(state.pick_deadline).getTime() > Date.now() ||
    !state.nominating_member_id
  ) {
    return {} // nothing to enforce
  }

  const settings = resolveLeagueSettings(pool)
  const [picks, { data: available }] = await Promise.all([
    loadAuctionPicks(admin, poolId),
    admin
      .from('ff_players')
      .select('*')
      .eq('active', true)
      .order('default_rank', { ascending: true, nullsFirst: false }),
  ])

  const draftedIds = new Set(picks.map((p) => p.player_id))
  const undrafted = ((available ?? []) as FFPlayer[]).filter((p) => !draftedIds.has(p.id))
  const nominatorPositions = picks
    .filter((p) => p.member_id === state.nominating_member_id)
    .map((p) => p.player_position as FFPosition)
  const remaining = draftRounds(settings) - nominatorPositions.length

  const player = autopickPlayer(undrafted, nominatorPositions, remaining, settings)
  if (!player) return { error: 'No players available to nominate' }

  const result = await openLot(admin, pool, state, settings, player, state.nominating_member_id)
  // A concurrent nomination already opened the lot — that's success
  if (result.error?.includes('nomination just came in')) return {}
  return result
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

  await buildSeasonArtifacts(admin, pool, members, settings)
}

/**
 * Rosters, auto-filled week-1 lineups, and the season schedule.
 * Best ball: rosters only — no lineups ever (scores are computed on-read),
 * and matchups only in h2h format.
 */
async function buildSeasonArtifacts(
  admin: Admin,
  pool: Pool,
  members: PoolMember[],
  settings: FFLeagueSettings
) {
  const isBestBall = pool.game_type === 'ff_bestball'
  const { data: picks } = await admin
    .from('ff_draft_picks')
    .select('*')
    .eq('pool_id', pool.id)
    .order('pick_number')
  // Best-first per member: price desc for auction, pick order for snake
  const allPicks = ((picks ?? []) as FFDraftPick[]).sort(
    (a, b) => (b.price ?? 0) - (a.price ?? 0) || a.pick_number - b.pick_number
  )

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
  const lineupRows = isBestBall ? [] : members.flatMap((m) => {
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

  // Regular-season schedule (ordered by draft position for determinism).
  // Best ball only schedules matchups in h2h format.
  if (isBestBall && resolveBestBallSettings(pool).format !== 'h2h') return
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
  const resumedStatus = state.status === 'paused' ? 'paused' : 'in_progress'
  const timedDeadline =
    resumedStatus !== 'paused' && state.timer_seconds
      ? new Date(Date.now() + state.timer_seconds * 1000).toISOString()
      : null

  if (state.draft_type === 'auction') {
    // Rewind to re-nominate the undone lot (nominator is recomputed from the
    // remaining picks — same deterministic skip logic closeFfLot uses)
    const picks = await loadAuctionPicks(admin, poolId)
    const states = auctionMemberStates(members, picks)
    const counts = new Map([...states].map(([id, s]) => [id, s.rosterCount]))
    const nominator = nextNominatorId(
      members.map((m) => m.id),
      counts,
      lastPick.pick_number,
      draftRounds(settings)
    )
    await admin
      .from('ff_draft_state')
      .update({
        status: resumedStatus,
        nomination_number: lastPick.pick_number,
        nominating_member_id: nominator,
        lot_player_id: null,
        lot_high_bid: null,
        lot_high_bidder_id: null,
        lot_deadline: null,
        pick_deadline: timedDeadline,
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', poolId)

    revalidateDraft(poolId)
    return {}
  }

  const order = generateSnakeOrder({ managerCount: members.length, numRounds: draftRounds(settings) })
  const pickInfo = getPickInfo(order, lastPick.pick_number)
  if (!pickInfo) return { error: 'Invalid pick number' }
  const memberForPick = members.find((m) => m.draft_position === pickInfo.managerPosition)

  await admin
    .from('ff_draft_state')
    .update({
      status: resumedStatus,
      current_round: pickInfo.round,
      current_pick_number: lastPick.pick_number,
      current_member_id: memberForPick?.id ?? null,
      pick_deadline: timedDeadline,
      updated_at: new Date().toISOString(),
    })
    .eq('pool_id', poolId)

  revalidateDraft(poolId)
  return {}
}
