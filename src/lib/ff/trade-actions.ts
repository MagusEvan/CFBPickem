'use server'

// Trade lifecycle: propose -> accept/reject/cancel -> (commissioner review)
// -> execute. Execution re-validates ownership, roster legality, and lineup
// locks, then swaps roster rows and re-slots players for both sides.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLeagueSettings, totalRosterSpots } from './settings'
import { isPlayerLocked } from './roster'
import {
  type Admin,
  assignToLineups,
  clearFromLineups,
  getSeasonWeek,
  logTransaction,
} from './waiver-processing'
import type { FFLeagueSettings, FFPlayer, FFTrade } from './types'

interface TradeCtx {
  admin: Admin
  pool: { id: string; season_year: number; admin_id: string }
  settings: FFLeagueSettings
  member: { id: string }
  isCommissioner: boolean
}

async function loadCtx(poolId: string): Promise<TradeCtx | { error: string }> {
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
  if (pool.draft_status !== 'completed') return { error: 'Trades open after the draft' }

  const settings = resolveLeagueSettings(pool)
  if (!settings.trades.enabled) return { error: 'Trades are disabled in this league' }

  return {
    admin,
    pool,
    settings,
    member: memberRes.data,
    isCommissioner: pool.admin_id === user.id,
  }
}

async function pastTradeDeadline(ctx: TradeCtx): Promise<boolean> {
  const { deadlineWeek } = ctx.settings.trades
  if (deadlineWeek === null) return false
  const week = await getSeasonWeek(ctx.admin, ctx.pool.season_year)
  return week > deadlineWeek
}

/** Both sides own their players and end within the roster limit. */
async function validateTradeShape(
  admin: Admin,
  poolId: string,
  settings: FFLeagueSettings,
  proposerId: string,
  recipientId: string,
  proposerPlayerIds: string[],
  recipientPlayerIds: string[]
): Promise<{ error?: string }> {
  if (proposerPlayerIds.length + recipientPlayerIds.length === 0) {
    return { error: 'A trade must include at least one player' }
  }
  if (proposerId === recipientId) return { error: 'You cannot trade with yourself' }

  const { data } = await admin
    .from('ff_rosters')
    .select('member_id, player_id')
    .eq('pool_id', poolId)
    .in('member_id', [proposerId, recipientId])
  const rows = data ?? []
  const ownedBy = (memberId: string) =>
    new Set(rows.filter((r) => r.member_id === memberId).map((r) => r.player_id))

  const proposerRoster = ownedBy(proposerId)
  const recipientRoster = ownedBy(recipientId)
  for (const id of proposerPlayerIds) {
    if (!proposerRoster.has(id)) return { error: 'A player in this trade changed teams — start over' }
  }
  for (const id of recipientPlayerIds) {
    if (!recipientRoster.has(id)) return { error: 'A player in this trade changed teams — start over' }
  }

  const limit = totalRosterSpots(settings)
  const proposerAfter = proposerRoster.size - proposerPlayerIds.length + recipientPlayerIds.length
  const recipientAfter = recipientRoster.size - recipientPlayerIds.length + proposerPlayerIds.length
  if (proposerAfter > limit || recipientAfter > limit) {
    return { error: `Trade would exceed the ${limit}-player roster limit` }
  }
  return {}
}

export async function proposeFfTrade(
  poolId: string,
  recipientMemberId: string,
  givePlayerIds: string[],
  receivePlayerIds: string[]
): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, settings, member } = ctx

  if (await pastTradeDeadline(ctx)) return { error: 'The trade deadline has passed' }

  const { data: recipient } = await admin
    .from('pool_members')
    .select('id')
    .eq('id', recipientMemberId)
    .eq('pool_id', poolId)
    .maybeSingle()
  if (!recipient) return { error: 'Trade partner not found' }

  const shape = await validateTradeShape(
    admin, poolId, settings, member.id, recipientMemberId, givePlayerIds, receivePlayerIds
  )
  if (shape.error) return shape

  const { error } = await admin.from('ff_trades').insert({
    pool_id: poolId,
    proposer_member_id: member.id,
    recipient_member_id: recipientMemberId,
    proposer_player_ids: givePlayerIds,
    recipient_player_ids: receivePlayerIds,
  })
  if (error) return { error: error.message }

  revalidatePath(`/pools/${poolId}/trades`)
  return {}
}

export async function respondToFfTrade(
  poolId: string,
  tradeId: string,
  accept: boolean
): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, settings, member } = ctx

  const { data: trade } = await admin
    .from('ff_trades')
    .select('*')
    .eq('id', tradeId)
    .eq('pool_id', poolId)
    .single<FFTrade>()
  if (!trade || trade.status !== 'proposed') return { error: 'Trade is no longer open' }
  if (trade.recipient_member_id !== member.id) {
    return { error: 'Only the receiving manager can respond' }
  }

  if (!accept) {
    await admin
      .from('ff_trades')
      .update({ status: 'rejected', responded_at: new Date().toISOString() })
      .eq('id', tradeId)
      .eq('status', 'proposed')
    revalidatePath(`/pools/${poolId}/trades`)
    return {}
  }

  if (await pastTradeDeadline(ctx)) return { error: 'The trade deadline has passed' }

  // Claim the response atomically so double-clicks/races act once
  const { data: claimed } = await admin
    .from('ff_trades')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', tradeId)
    .eq('status', 'proposed')
    .select('id')
  if (!claimed || claimed.length === 0) return { error: 'Trade is no longer open' }

  if (settings.trades.review === 'commissioner') {
    revalidatePath(`/pools/${poolId}/trades`)
    return {} // awaits commissioner approval
  }
  // No review step: a lock failure reopens the trade so it can be
  // re-accepted once the week turns over
  return executeTrade(admin, pool, settings, { ...trade, status: 'accepted' }, true)
}

export async function cancelFfTrade(poolId: string, tradeId: string): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, member } = ctx

  const { data } = await admin
    .from('ff_trades')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', tradeId)
    .eq('pool_id', poolId)
    .eq('proposer_member_id', member.id)
    .eq('status', 'proposed')
    .select('id')
  if (!data || data.length === 0) return { error: 'Trade is no longer open' }

  revalidatePath(`/pools/${poolId}/trades`)
  return {}
}

/** Commissioner review: approve (executes) or veto an accepted trade. */
export async function reviewFfTrade(
  poolId: string,
  tradeId: string,
  approve: boolean
): Promise<{ error?: string }> {
  const ctx = await loadCtx(poolId)
  if ('error' in ctx) return { error: ctx.error }
  const { admin, pool, settings, isCommissioner } = ctx
  if (!isCommissioner) return { error: 'Only the commissioner can review trades' }

  const { data: trade } = await admin
    .from('ff_trades')
    .select('*')
    .eq('id', tradeId)
    .eq('pool_id', poolId)
    .single<FFTrade>()
  if (!trade || trade.status !== 'accepted') return { error: 'Trade is not awaiting review' }

  if (!approve) {
    await admin
      .from('ff_trades')
      .update({ status: 'vetoed', resolution: 'Vetoed by the commissioner' })
      .eq('id', tradeId)
      .eq('status', 'accepted')
    revalidatePath(`/pools/${poolId}/trades`)
    return {}
  }
  return executeTrade(admin, pool, settings, trade)
}

/**
 * Swap the rosters. Re-validates ownership/limits/locks at execution time;
 * a failed validation marks the trade invalid rather than half-applying.
 */
async function executeTrade(
  admin: Admin,
  pool: TradeCtx['pool'],
  settings: FFLeagueSettings,
  trade: FFTrade,
  reopenOnLock = false
): Promise<{ error?: string }> {
  const poolId = pool.id

  const fail = async (reason: string) => {
    await admin
      .from('ff_trades')
      .update({ status: 'vetoed', resolution: reason })
      .eq('id', trade.id)
      .eq('status', 'accepted')
    revalidatePath(`/pools/${poolId}/trades`)
    return { error: reason }
  }

  const shape = await validateTradeShape(
    admin,
    poolId,
    settings,
    trade.proposer_member_id,
    trade.recipient_member_id,
    trade.proposer_player_ids,
    trade.recipient_player_ids
  )
  if (shape.error) return fail(shape.error)

  // No player in the trade may have already kicked off this week
  const allPlayerIds = [...trade.proposer_player_ids, ...trade.recipient_player_ids]
  const week = await getSeasonWeek(admin, pool.season_year)
  const [playersRes, gamesRes] = await Promise.all([
    admin.from('ff_players').select('*').in('id', allPlayerIds),
    admin
      .from('ff_nfl_games')
      .select('start_time, home_team_id, away_team_id')
      .eq('season_year', pool.season_year)
      .eq('season_type', 2)
      .eq('week', week),
  ])
  const players = (playersRes.data ?? []) as FFPlayer[]
  const startByTeam = new Map<string, string>()
  for (const g of gamesRes.data ?? []) {
    if (g.home_team_id) startByTeam.set(g.home_team_id, g.start_time)
    if (g.away_team_id) startByTeam.set(g.away_team_id, g.start_time)
  }
  const lockedPlayer = players.find((p) => isPlayerLocked(p, startByTeam))
  if (lockedPlayer) {
    if (reopenOnLock) {
      await admin
        .from('ff_trades')
        .update({ status: 'proposed', responded_at: null })
        .eq('id', trade.id)
        .eq('status', 'accepted')
    }
    return { error: `${lockedPlayer.name}'s game has started — the trade can execute after this week` }
  }

  // Swap ownership
  const move = (playerIds: string[], from: string, to: string) =>
    playerIds.map((playerId) =>
      admin
        .from('ff_rosters')
        .update({ member_id: to, acquired_via: 'trade', acquisition_cost: null })
        .eq('pool_id', poolId)
        .eq('player_id', playerId)
        .eq('member_id', from)
    )
  await Promise.all([
    ...move(trade.proposer_player_ids, trade.proposer_member_id, trade.recipient_member_id),
    ...move(trade.recipient_player_ids, trade.recipient_member_id, trade.proposer_member_id),
  ])

  // Re-slot: clear traded players everywhere ahead, then bench them for
  // their new manager
  const playerById = new Map(players.map((p) => [p.id, p]))
  for (const id of allPlayerIds) await clearFromLineups(admin, poolId, id, week)
  for (const id of trade.proposer_player_ids) {
    const p = playerById.get(id)
    if (p) await assignToLineups(admin, poolId, trade.recipient_member_id, p, settings, week)
  }
  for (const id of trade.recipient_player_ids) {
    const p = playerById.get(id)
    if (p) await assignToLineups(admin, poolId, trade.proposer_member_id, p, settings, week)
  }

  await admin
    .from('ff_trades')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', trade.id)

  const names = (ids: string[]) =>
    ids.map((id) => playerById.get(id)?.name ?? 'a player').join(', ')
  await logTransaction(admin, poolId, trade.proposer_member_id, 'trade', {
    note: `Traded ${names(trade.proposer_player_ids) || 'nothing'} for ${names(trade.recipient_player_ids) || 'nothing'}`,
  })

  revalidatePath(`/pools/${poolId}/trades`)
  revalidatePath(`/pools/${poolId}/team`)
  revalidatePath(`/pools/${poolId}/players`)
  revalidatePath(`/pools/${poolId}/transactions`)
  return {}
}
