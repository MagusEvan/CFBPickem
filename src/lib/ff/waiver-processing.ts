// Waiver/FA server-side core shared by waiver-actions.ts and page loads.
// No 'use server' and no revalidatePath, so pages can invoke lazy waiver
// processing during render (actions revalidate afterwards themselves).

import type { createAdminClient } from '@/lib/supabase/admin'
import { totalRosterSpots } from './settings'
import { eligiblePositionsForSlot, isPlayerLocked } from './roster'
import { currentWeek } from './refresh'
import { nextProcessTime, processClaims } from './waivers'
import type {
  FFLeagueSettings,
  FFLineupSlot,
  FFPlayer,
  FFRosterEntry,
  FFWaiverClaim,
  FFWaiverPriority,
  FFWaiverState,
  FFTransactionType,
} from './types'

export type Admin = ReturnType<typeof createAdminClient>

export interface WaiverPool {
  id: string
  season_year: number
}

export async function getSeasonWeek(admin: Admin, seasonYear: number): Promise<number> {
  const { data: games } = await admin
    .from('ff_nfl_games')
    .select('id, week, status, start_time')
    .eq('season_year', seasonYear)
    .eq('season_type', 2)
  return currentWeek(games ?? []) ?? 1
}

export function logTransaction(
  admin: Admin,
  poolId: string,
  memberId: string | null,
  type: FFTransactionType,
  detail: Record<string, unknown>
) {
  return admin.from('ff_transactions').insert({ pool_id: poolId, member_id: memberId, type, detail })
}

export const playerDetail = (p: Pick<FFPlayer, 'id' | 'name' | 'position'>) => ({
  id: p.id,
  name: p.name,
  position: p.position,
})

/** Clear a dropped player out of current + future lineup slots. */
export async function clearFromLineups(
  admin: Admin,
  poolId: string,
  playerId: string,
  fromWeek: number
) {
  await admin
    .from('ff_lineup_slots')
    .update({ player_id: null })
    .eq('pool_id', poolId)
    .eq('player_id', playerId)
    .gte('week', fromWeek)
}

/**
 * Slot an added player into each already-materialized week >= fromWeek:
 * first empty BENCH slot, else an empty eligible starter slot. Best-effort —
 * a week with no eligible empty slot is skipped.
 */
export async function assignToLineups(
  admin: Admin,
  poolId: string,
  memberId: string,
  player: FFPlayer,
  settings: FFLeagueSettings,
  fromWeek: number
) {
  const { data } = await admin
    .from('ff_lineup_slots')
    .select('*')
    .eq('pool_id', poolId)
    .eq('member_id', memberId)
    .gte('week', fromWeek)
  const slots = (data ?? []) as FFLineupSlot[]

  const byWeek = new Map<number, FFLineupSlot[]>()
  for (const s of slots) byWeek.set(s.week, [...(byWeek.get(s.week) ?? []), s])

  const targets: string[] = []
  for (const weekSlots of byWeek.values()) {
    const empty = weekSlots.filter(
      (s) =>
        s.player_id === null &&
        s.slot !== 'IR' &&
        eligiblePositionsForSlot(s.slot, settings).includes(player.position)
    )
    const target = empty.find((s) => s.slot === 'BENCH') ?? empty[0]
    if (target) targets.push(target.id)
  }

  await Promise.all(
    targets.map((id) =>
      admin.from('ff_lineup_slots').update({ player_id: player.id }).eq('id', id)
    )
  )
}

/** Load a pool's waiver state row, creating it (with a schedule) if missing. */
export async function ensureWaiverState(
  admin: Admin,
  poolId: string,
  settings: FFLeagueSettings
): Promise<FFWaiverState> {
  const next = nextProcessTime(settings.waivers).toISOString()
  await admin
    .from('ff_waiver_state')
    .upsert({ pool_id: poolId, next_process_at: next }, { onConflict: 'pool_id', ignoreDuplicates: true })
  const { data } = await admin.from('ff_waiver_state').select('*').eq('pool_id', poolId).single()
  const state = data as FFWaiverState
  if (!state.next_process_at) {
    await admin.from('ff_waiver_state').update({ next_process_at: next }).eq('pool_id', poolId)
    state.next_process_at = next
  }
  return state
}

/**
 * Waiver priority rows, lazily created in reverse draft order (last pick
 * gets first priority). Members missing rows (later joiners) go to the back.
 */
export async function ensureWaiverPriority(
  admin: Admin,
  poolId: string
): Promise<FFWaiverPriority[]> {
  const [prioRes, membersRes] = await Promise.all([
    admin.from('ff_waiver_priority').select('*').eq('pool_id', poolId),
    admin
      .from('pool_members')
      .select('id, draft_position')
      .eq('pool_id', poolId)
      .order('draft_position', { ascending: false, nullsFirst: false }),
  ])
  const existing = (prioRes.data ?? []) as FFWaiverPriority[]
  const have = new Set(existing.map((r) => r.member_id))
  const missing = (membersRes.data ?? []).filter((m) => !have.has(m.id))
  if (missing.length === 0) return existing

  let next = existing.reduce((max, r) => Math.max(max, r.priority), 0)
  const rows = missing.map((m) => ({
    pool_id: poolId,
    member_id: m.id,
    priority: ++next,
    faab_spent: 0,
  }))
  await admin
    .from('ff_waiver_priority')
    .upsert(rows, { onConflict: 'pool_id,member_id', ignoreDuplicates: true })
  const { data } = await admin.from('ff_waiver_priority').select('*').eq('pool_id', poolId)
  return (data ?? []) as FFWaiverPriority[]
}

/** True when the player was dropped recently and hasn't cleared waivers. */
export async function isOnWaivers(
  admin: Admin,
  poolId: string,
  playerId: string
): Promise<boolean> {
  const { data } = await admin
    .from('ff_player_waivers')
    .select('clears_at')
    .eq('pool_id', poolId)
    .eq('player_id', playerId)
    .maybeSingle()
  return data !== null && new Date(data.clears_at).getTime() > Date.now()
}

export interface DropValidation {
  entry: FFRosterEntry
  player: FFPlayer
}

/** The member may drop this player: owns them and their game hasn't started. */
export async function validateDrop(
  admin: Admin,
  poolId: string,
  memberId: string,
  playerId: string,
  seasonYear: number,
  week: number
): Promise<DropValidation | { error: string }> {
  const [entryRes, playerRes, gamesRes] = await Promise.all([
    admin
      .from('ff_rosters')
      .select('*')
      .eq('pool_id', poolId)
      .eq('member_id', memberId)
      .eq('player_id', playerId)
      .maybeSingle(),
    admin.from('ff_players').select('*').eq('id', playerId).single(),
    admin
      .from('ff_nfl_games')
      .select('week, start_time, home_team_id, away_team_id')
      .eq('season_year', seasonYear)
      .eq('season_type', 2)
      .eq('week', week),
  ])

  if (!entryRes.data) return { error: 'That player is not on your roster' }
  const player = playerRes.data as FFPlayer | null
  if (!player) return { error: 'Player not found' }

  const startByTeam = new Map<string, string>()
  for (const g of gamesRes.data ?? []) {
    if (g.home_team_id) startByTeam.set(g.home_team_id, g.start_time)
    if (g.away_team_id) startByTeam.set(g.away_team_id, g.start_time)
  }
  if (isPlayerLocked(player, startByTeam)) {
    return { error: `${player.name}'s game has started — you can drop them after this week` }
  }
  return { entry: entryRes.data as FFRosterEntry, player }
}

/**
 * Lazy waiver processing: run only when the scheduled time has passed.
 * Safe to call on every players-page load.
 */
export async function maybeProcessWaivers(
  admin: Admin,
  pool: WaiverPool,
  settings: FFLeagueSettings
): Promise<void> {
  if (settings.waivers.type === 'none') return
  const state = await ensureWaiverState(admin, pool.id, settings)
  if (!state.next_process_at || new Date(state.next_process_at).getTime() > Date.now()) return
  await runWaiverProcessing(admin, pool, settings, state.next_process_at)
}

const PROCESSING_STALE_MS = 2 * 60 * 1000

/**
 * Resolve all pending claims. An atomic conditional update on
 * ff_waiver_state ensures a single concurrent caller does the work (stale
 * claims recover after PROCESSING_STALE_MS in case a run died mid-flight).
 */
export async function runWaiverProcessing(
  admin: Admin,
  pool: WaiverPool,
  settings: FFLeagueSettings,
  dueAt: string
): Promise<void> {
  const poolId = pool.id

  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS).toISOString()
  const { data: claimed } = await admin
    .from('ff_waiver_state')
    .update({ processing: true, processing_claimed_at: new Date().toISOString() })
    .eq('pool_id', poolId)
    .lte('next_process_at', new Date().toISOString())
    .or(`processing.eq.false,processing_claimed_at.lt.${staleBefore}`)
    .select('pool_id')
  if (!claimed || claimed.length === 0) return

  try {
    const [priority, claimsRes, rostersRes] = await Promise.all([
      ensureWaiverPriority(admin, poolId),
      admin
        .from('ff_waiver_claims')
        .select('*')
        .eq('pool_id', poolId)
        .eq('status', 'pending')
        .order('created_at'),
      admin.from('ff_rosters').select('member_id, player_id').eq('pool_id', poolId),
    ])

    const claims = (claimsRes.data ?? []) as FFWaiverClaim[]

    if (claims.length > 0) {
      const week = await getSeasonWeek(admin, pool.season_year)
      const rosterByMember = new Map<string, string[]>()
      for (const r of rostersRes.data ?? []) {
        rosterByMember.set(r.member_id, [...(rosterByMember.get(r.member_id) ?? []), r.player_id])
      }

      const outcome = processClaims(
        claims.map((c) => ({
          id: c.id,
          memberId: c.member_id,
          addPlayerId: c.add_player_id,
          dropPlayerId: c.drop_player_id,
          bid: c.bid,
          claimOrder: c.claim_order,
        })),
        priority.map((p) => ({
          memberId: p.member_id,
          priority: p.priority,
          faabRemaining: settings.waivers.faabBudget - p.faab_spent,
          rosterPlayerIds: rosterByMember.get(p.member_id) ?? [],
          rosterLimit: totalRosterSpots(settings),
        })),
        settings.waivers.type === 'faab' ? 'faab' : 'priority'
      )

      const playerIds = [
        ...outcome.adds.map((a) => a.playerId),
        ...outcome.drops.map((d) => d.playerId),
      ]
      const { data: playerRows } =
        playerIds.length > 0
          ? await admin.from('ff_players').select('*').in('id', playerIds)
          : { data: [] }
      const players = new Map(((playerRows ?? []) as FFPlayer[]).map((p) => [p.id, p]))
      const claimById = new Map(claims.map((c) => [c.id, c]))
      const now = new Date().toISOString()

      // Drops first (free slots + ownership), then adds, then bookkeeping
      for (const d of outcome.drops) {
        await admin
          .from('ff_rosters')
          .delete()
          .eq('pool_id', poolId)
          .eq('member_id', d.memberId)
          .eq('player_id', d.playerId)
        await clearFromLineups(admin, poolId, d.playerId, week)
      }
      for (const a of outcome.adds) {
        await admin.from('ff_rosters').insert({
          pool_id: poolId,
          member_id: a.memberId,
          player_id: a.playerId,
          acquired_via: 'waiver',
          acquisition_cost: settings.waivers.type === 'faab' ? a.bid : null,
        })
        const player = players.get(a.playerId)
        if (player) await assignToLineups(admin, poolId, a.memberId, player, settings, week)
      }

      await Promise.all([
        ...outcome.results.map((r) =>
          admin
            .from('ff_waiver_claims')
            .update({ status: r.status, resolution: r.resolution, processed_at: now })
            .eq('id', r.id)
        ),
        ...[...outcome.newPriority].map(([memberId, prio]) =>
          admin
            .from('ff_waiver_priority')
            .update({ priority: prio })
            .eq('pool_id', poolId)
            .eq('member_id', memberId)
        ),
        ...[...outcome.faabSpent].map(([memberId, spent]) => {
          const row = priority.find((p) => p.member_id === memberId)
          return admin
            .from('ff_waiver_priority')
            .update({ faab_spent: (row?.faab_spent ?? 0) + spent })
            .eq('pool_id', poolId)
            .eq('member_id', memberId)
        }),
      ])

      for (const r of outcome.results) {
        if (r.status !== 'won') continue
        const c = claimById.get(r.id)
        if (!c) continue
        const add = players.get(c.add_player_id)
        const drop = c.drop_player_id ? players.get(c.drop_player_id) : null
        await logTransaction(admin, poolId, c.member_id, 'waiver_claim', {
          ...(add ? { add: playerDetail(add) } : {}),
          ...(drop ? { drop: playerDetail(drop) } : {}),
          ...(settings.waivers.type === 'faab' ? { bid: c.bid } : {}),
        })
      }
    }

    // Everything dropped before this run has now cleared waivers
    await admin.from('ff_player_waivers').delete().eq('pool_id', poolId).lte('clears_at', dueAt)
  } finally {
    await admin
      .from('ff_waiver_state')
      .update({
        processing: false,
        processing_claimed_at: null,
        next_process_at: nextProcessTime(settings.waivers).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', poolId)
  }
}
