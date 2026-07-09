import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureFreshPlayerCatalog, ensureFreshFfData, currentWeek } from './refresh'
import { scoreLineup } from './scoring'
import type {
  FFPlayer,
  FFNflGame,
  FFStatLine,
  FFRosterEntry,
  FFLineupSlot,
  FFMatchup,
  FFScoringSettings,
  FFTransaction,
  FFWaiverClaim,
  FFWaiverPriority,
  FFWaiverState,
} from './types'

/** Full active player catalog (refreshes from ESPN if stale). */
export async function getFfPlayers(seasonYear: number): Promise<FFPlayer[]> {
  await ensureFreshPlayerCatalog(seasonYear)

  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_players')
    .select('*')
    .eq('active', true)
    .order('default_rank', { ascending: true, nullsFirst: false })
  return (data ?? []) as FFPlayer[]
}

/** Players by id, regardless of active flag (rostered players may go inactive). */
export async function getFfPlayersByIds(ids: string[]): Promise<Map<string, FFPlayer>> {
  if (ids.length === 0) return new Map()
  const supabase = await createClient()
  const { data } = await supabase.from('ff_players').select('*').in('id', ids)
  return new Map(((data ?? []) as FFPlayer[]).map((p) => [p.id, p]))
}

/**
 * Current fantasy week: earliest week with a non-final game (season over ->
 * last week). Refreshes schedule + current-week stats first, so pages that
 * call this always see fresh scores.
 */
export async function getFfCurrentWeek(seasonYear: number): Promise<number> {
  await ensureFreshFfData(seasonYear)

  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_nfl_games')
    .select('id, week, status, start_time')
    .eq('season_year', seasonYear)
    .eq('season_type', 2)
  return currentWeek(data ?? []) ?? 1
}

/** All NFL games for one week (drives lineup locks + live badges). */
export async function getFfWeekGames(seasonYear: number, week: number): Promise<FFNflGame[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_nfl_games')
    .select('*')
    .eq('season_year', seasonYear)
    .eq('season_type', 2)
    .eq('week', week)
    .order('start_time')
  return (data ?? []) as FFNflGame[]
}

/** team_id -> game start_time for a week's games (lock checks). */
export function weekGameStartByTeamId(games: FFNflGame[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const g of games) {
    if (g.home_team_id) map.set(g.home_team_id, g.start_time)
    if (g.away_team_id) map.set(g.away_team_id, g.start_time)
  }
  return map
}

/** Raw stat lines keyed by player id for one week. */
export async function getFfWeekStats(
  seasonYear: number,
  week: number
): Promise<Record<string, FFStatLine>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_player_stats')
    .select('player_id, stats')
    .eq('season_year', seasonYear)
    .eq('week', week)
  const byPlayer: Record<string, FFStatLine> = {}
  for (const row of data ?? []) byPlayer[row.player_id] = row.stats as FFStatLine
  return byPlayer
}

/** All roster entries for a pool. */
export async function getFfRosters(poolId: string): Promise<FFRosterEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('ff_rosters').select('*').eq('pool_id', poolId)
  return (data ?? []) as FFRosterEntry[]
}

/** All matchups for a pool (optionally one week), ordered by week. */
export async function getFfMatchups(poolId: string, week?: number): Promise<FFMatchup[]> {
  const supabase = await createClient()
  let query = supabase.from('ff_matchups').select('*').eq('pool_id', poolId).order('week')
  if (week !== undefined) query = query.eq('week', week)
  const { data } = await query
  return (data ?? []) as FFMatchup[]
}

/**
 * Lineup slots for a pool + week, lazily materialized: if the week has no
 * rows yet, each member's most recent earlier lineup is copied forward
 * (upsert with ignoreDuplicates so concurrent page loads can't double-write).
 */
export async function getFfLineups(poolId: string, week: number): Promise<FFLineupSlot[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_lineup_slots')
    .select('*')
    .eq('pool_id', poolId)
    .eq('week', week)
    .order('member_id')
  if (data && data.length > 0) return data as FFLineupSlot[]

  // Materialize from the latest earlier week that has rows
  const admin = createAdminClient()
  const { data: prior } = await admin
    .from('ff_lineup_slots')
    .select('member_id, week, slot, slot_index, player_id')
    .eq('pool_id', poolId)
    .lt('week', week)
    .order('week', { ascending: false })
  if (!prior || prior.length === 0) return []

  const latestWeek = prior[0].week as number
  const rows = prior
    .filter((r) => r.week === latestWeek)
    .map((r) => ({
      pool_id: poolId,
      member_id: r.member_id,
      week,
      slot: r.slot,
      slot_index: r.slot_index,
      player_id: r.player_id,
    }))
  await admin
    .from('ff_lineup_slots')
    .upsert(rows, { onConflict: 'pool_id,member_id,week,slot,slot_index', ignoreDuplicates: true })

  const { data: created } = await supabase
    .from('ff_lineup_slots')
    .select('*')
    .eq('pool_id', poolId)
    .eq('week', week)
    .order('member_id')
  return (created ?? []) as FFLineupSlot[]
}

/** Waiver state row (null until the first transaction/page creates it). */
export async function getFfWaiverState(poolId: string): Promise<FFWaiverState | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_waiver_state')
    .select('*')
    .eq('pool_id', poolId)
    .maybeSingle()
  return data as FFWaiverState | null
}

/** Waiver priority/FAAB rows (may be missing members until first processing). */
export async function getFfWaiverPriority(poolId: string): Promise<FFWaiverPriority[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_waiver_priority')
    .select('*')
    .eq('pool_id', poolId)
    .order('priority')
  return (data ?? []) as FFWaiverPriority[]
}

/**
 * Waiver claims visible to the caller. RLS hides other members' pending
 * claims (resolved claims are pool-visible).
 */
export async function getFfWaiverClaims(poolId: string): Promise<FFWaiverClaim[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_waiver_claims')
    .select('*')
    .eq('pool_id', poolId)
    .order('claim_order')
  return (data ?? []) as FFWaiverClaim[]
}

/** player_id -> clears_at for players still on waivers. */
export async function getFfPlayerWaivers(poolId: string): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_player_waivers')
    .select('player_id, clears_at')
    .eq('pool_id', poolId)
    .gt('clears_at', new Date().toISOString())
  return new Map((data ?? []).map((r) => [r.player_id, r.clears_at]))
}

/** Transaction log, newest first. */
export async function getFfTransactions(poolId: string, limit = 100): Promise<FFTransaction[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ff_transactions')
    .select('*')
    .eq('pool_id', poolId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as FFTransaction[]
}

export interface FFWeekScores {
  week: number
  /** True when every NFL game of the week is final (counts toward the record) */
  final: boolean
  scoreByMember: Map<string, number>
}

/**
 * Each member's lineup score for weeks 1..throughWeek (computed on-read from
 * raw stats × league scoring). Only reads lineups already materialized —
 * a week with no lineup rows scores 0 for everyone.
 */
export async function getFfWeekScores(
  poolId: string,
  seasonYear: number,
  scoring: FFScoringSettings,
  throughWeek: number
): Promise<FFWeekScores[]> {
  const supabase = await createClient()
  const [slotsRes, statsRes, gamesRes] = await Promise.all([
    supabase
      .from('ff_lineup_slots')
      .select('member_id, week, slot, player_id')
      .eq('pool_id', poolId)
      .lte('week', throughWeek),
    supabase
      .from('ff_player_stats')
      .select('player_id, week, stats')
      .eq('season_year', seasonYear)
      .lte('week', throughWeek),
    supabase
      .from('ff_nfl_games')
      .select('week, status')
      .eq('season_year', seasonYear)
      .eq('season_type', 2)
      .lte('week', throughWeek),
  ])

  const statsByWeek = new Map<number, Record<string, FFStatLine>>()
  for (const row of statsRes.data ?? []) {
    const forWeek = statsByWeek.get(row.week) ?? {}
    forWeek[row.player_id] = row.stats as FFStatLine
    statsByWeek.set(row.week, forWeek)
  }

  const weekHasGames = new Set<number>()
  const weekHasNonFinal = new Set<number>()
  for (const g of gamesRes.data ?? []) {
    weekHasGames.add(g.week)
    if (g.status !== 'final') weekHasNonFinal.add(g.week)
  }

  const slotsByWeekMember = new Map<number, Map<string, Pick<FFLineupSlot, 'slot' | 'player_id'>[]>>()
  for (const row of slotsRes.data ?? []) {
    const byMember = slotsByWeekMember.get(row.week) ?? new Map()
    const list = byMember.get(row.member_id) ?? []
    list.push({ slot: row.slot, player_id: row.player_id })
    byMember.set(row.member_id, list)
    slotsByWeekMember.set(row.week, byMember)
  }

  const results: FFWeekScores[] = []
  for (let week = 1; week <= throughWeek; week++) {
    const scoreByMember = new Map<string, number>()
    const byMember = slotsByWeekMember.get(week)
    const stats = statsByWeek.get(week) ?? {}
    if (byMember) {
      for (const [memberId, slots] of byMember) {
        scoreByMember.set(memberId, scoreLineup(slots, stats, scoring))
      }
    }
    results.push({
      week,
      final: weekHasGames.has(week) && !weekHasNonFinal.has(week),
      scoreByMember,
    })
  }
  return results
}
