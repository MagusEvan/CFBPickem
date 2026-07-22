'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { calculateStandings, calculateWorldCupStandings } from '@/lib/scoring/engine'
import { getTournaments, getTournamentMembers, getTournamentPicks, getTournamentGolfers } from '@/lib/pga/queries'
import { calculatePgaStandings } from '@/lib/pga/scoring'
import { resolveBestBallSettings, resolveLeagueSettings, resolveScoringSettings } from '@/lib/ff/settings'
import { getBestBallWeekScores, getFfCurrentWeek, getFfMatchups, getFfWeekScores } from '@/lib/ff/queries'
import { computeStandings, type FFMatchupResult } from '@/lib/ff/standings'
import { ensurePlayoffs, playoffChampion, type PlayoffScoreProvider } from '@/lib/ff/playoff-processing'
import { playoffRoundsCount } from '@/lib/ff/playoffs'
import { isFfFamily } from '@/lib/games/registry'
import type { Pool, DraftPick, CachedTeam, CachedGame, WorldCupScoringConfig } from '@/lib/types'

/** One row of the frozen final-standings snapshot. */
export interface ChampionshipRow {
  rank: number
  user_id: string
  display_name: string
  points: number
  /** Human-readable extra, e.g. a W-L record or "2 tournament wins" */
  detail?: string
}

const DEFAULT_WC_SCORING: WorldCupScoringConfig = {
  group: { win: 6, draw: 3, goal_points: 1, goal_cap: 3, shutout: 1 },
  knockout: {
    win: 6, ot_win: 5, shootout_win: 4, shootout_loss: 2,
    ot_loss: 1, loss: 0, goal_points: 1, goal_cap: null, shutout: 1,
  },
}

/**
 * Snapshot the pool's current standings into pool_championships.
 * Pool-admin only; re-finalizing overwrites the previous snapshot.
 */
export async function finalizeSeason(poolId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const pool = await getPool(poolId)
  if (!pool) return { error: 'Pool not found' }
  if (pool.admin_id !== user.id) return { error: 'Only the pool admin can finalize the season' }

  let rows: ChampionshipRow[]
  let championUserId: string | null = null
  try {
    const result = await snapshotStandings(pool)
    rows = result.rows
    championUserId = result.championUserId
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to compute standings' }
  }
  if (rows.length === 0) return { error: 'No standings to snapshot yet' }

  const admin = createAdminClient()
  const { error } = await admin.from('pool_championships').upsert(
    {
      pool_id: poolId,
      game_type: pool.game_type,
      season_year: pool.season_year,
      champion_user_id: championUserId ?? rows[0].user_id,
      final_standings: rows,
      finalized_at: new Date().toISOString(),
      finalized_by: user.id,
    },
    { onConflict: 'pool_id' }
  )
  if (error) return { error: error.message }

  revalidatePath(`/pools/${poolId}`)
  revalidatePath('/pools')
  return {}
}

async function snapshotStandings(
  pool: Pool
): Promise<{ rows: ChampionshipRow[]; championUserId: string | null }> {
  const members = await getPoolMembers(pool.id)
  const userByMember = new Map(members.map((m) => [m.id, m.user_id]))
  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))
  const supabase = await createClient()

  if (pool.game_type === 'cfb') {
    const [picksRes, teamsRes] = await Promise.all([
      supabase.from('draft_picks').select('*').eq('pool_id', pool.id),
      supabase.from('cached_teams').select('id,name,wins,losses,logo_url').eq('season_year', pool.season_year),
    ])
    const standings = calculateStandings(
      members,
      (picksRes.data ?? []) as DraftPick[],
      (teamsRes.data ?? []) as CachedTeam[],
      pool.scoring_strategy
    )
    return {
      rows: standings.map((s, i) => ({
        rank: i + 1,
        user_id: userByMember.get(s.memberId)!,
        display_name: s.displayName,
        points: s.totalPoints,
        detail: `${s.totalWins}-${s.totalLosses}`,
      })),
      championUserId: null,
    }
  }

  if (pool.game_type === 'world_cup') {
    const [picksRes, gamesRes] = await Promise.all([
      supabase.from('draft_picks').select('*').eq('pool_id', pool.id),
      supabase
        .from('cached_games')
        .select('id,home_team_id,away_team_id,home_score,away_score,status,stage,is_overtime,is_shootout,home_penalty_score,away_penalty_score')
        .eq('game_type', 'world_cup')
        .eq('season_year', pool.season_year),
    ])
    const standings = calculateWorldCupStandings(
      members,
      (picksRes.data ?? []) as DraftPick[],
      (gamesRes.data ?? []) as CachedGame[],
      pool.scoring_config ?? DEFAULT_WC_SCORING
    )
    return {
      rows: standings.map((s, i) => ({
        rank: i + 1,
        user_id: userByMember.get(s.memberId)!,
        display_name: s.displayName,
        points: s.totalPoints,
      })),
      championUserId: null,
    }
  }

  if (isFfFamily(pool.game_type)) {
    const settings = resolveLeagueSettings(pool)
    const scoring = resolveScoringSettings(pool)
    const currentWeek = await getFfCurrentWeek(pool.season_year)
    const throughWeek = Math.min(currentWeek, settings.season.regularSeasonWeeks)
    const bb = pool.game_type === 'ff_bestball' ? resolveBestBallSettings(pool) : null

    // Best ball total-points mode: leaderboard is just summed weekly scores
    if (bb && bb.format === 'total') {
      const weekScores = await getBestBallWeekScores(
        pool.id, pool.season_year, scoring, bb,
        Math.min(currentWeek, bb.season.regularSeasonWeeks)
      )
      const totals = new Map<string, number>()
      for (const ws of weekScores) {
        for (const [memberId, score] of ws.scoreByMember) {
          totals.set(memberId, (totals.get(memberId) ?? 0) + score)
        }
      }
      const sorted = members
        .map((m) => ({ memberId: m.id, points: totals.get(m.id) ?? 0 }))
        .sort((a, b) => b.points - a.points)
      return {
        rows: sorted.map((s, i) => ({
          rank: i + 1,
          user_id: userByMember.get(s.memberId)!,
          display_name: nameByMember.get(s.memberId) ?? '—',
          points: Math.round(s.points * 100) / 100,
        })),
        championUserId: null,
      }
    }

    const bestBallProvider: PlayoffScoreProvider | undefined = bb
      ? (p, through) => getBestBallWeekScores(p.id, p.season_year, scoring, bb, through)
      : undefined
    await ensurePlayoffs(createAdminClient(), pool, settings, currentWeek, bestBallProvider)

    const playoffRounds = playoffRoundsCount(settings.season.playoffTeams)
    const playoffFinalWeek = settings.season.playoffStartWeek + playoffRounds - 1
    const scoreThrough = Math.max(throughWeek, Math.min(currentWeek, playoffFinalWeek))

    const [matchups, weekScores] = await Promise.all([
      getFfMatchups(pool.id),
      bb
        ? getBestBallWeekScores(pool.id, pool.season_year, scoring, bb, scoreThrough)
        : getFfWeekScores(pool.id, pool.season_year, scoring, scoreThrough),
    ])
    const scoresByWeek = new Map(weekScores.map((ws) => [ws.week, ws]))
    const results: FFMatchupResult[] = matchups
      .filter((m) => !m.is_playoff && m.week <= throughWeek)
      .map((m) => {
        const ws = scoresByWeek.get(m.week)
        return {
          week: m.week,
          homeMemberId: m.home_member_id,
          awayMemberId: m.away_member_id,
          homeScore: ws?.scoreByMember.get(m.home_member_id) ?? 0,
          awayScore: m.away_member_id ? ws?.scoreByMember.get(m.away_member_id) ?? 0 : 0,
          final: ws?.final ?? false,
        }
      })
    const standings = computeStandings(members.map((m) => m.id), results)

    const finalWs = scoresByWeek.get(playoffFinalWeek)
    const championMemberId = playoffChampion(
      matchups.filter((m) => m.is_playoff),
      settings,
      finalWs?.final ?? false,
      finalWs?.scoreByMember ?? new Map()
    )

    return {
      rows: standings.map((s, i) => ({
        rank: i + 1,
        user_id: userByMember.get(s.memberId)!,
        display_name: nameByMember.get(s.memberId) ?? '—',
        points: Math.round(s.pointsFor * 100) / 100,
        detail: `${s.wins}-${s.losses}${s.ties > 0 ? `-${s.ties}` : ''}`,
      })),
      championUserId: championMemberId ? userByMember.get(championMemberId) ?? null : null,
    }
  }

  if (pool.game_type === 'pga') {
    // Champion = most tournament wins across the pool's completed tournaments,
    // tie-broken by combined score to par (lower is better).
    const tournaments = (await getTournaments(pool.id)).filter(
      (t) => t.draft_status === 'completed'
    )
    if (tournaments.length === 0) throw new Error('No completed tournaments to finalize')

    const wins = new Map<string, number>()
    const combined = new Map<string, number>()
    const names = new Map<string, string>()
    for (const t of tournaments) {
      const [tMembers, picks, golfers] = await Promise.all([
        getTournamentMembers(t.id),
        getTournamentPicks(t.id),
        getTournamentGolfers(t.id),
      ])
      const standings = calculatePgaStandings(
        tMembers, picks, golfers, t.top_n_scoring, t.course_par, t.missed_cut_score
      )
      const userByTMember = new Map(
        tMembers.map((m) => [m.id, m.pool_member?.user_id as string])
      )
      for (const m of tMembers) {
        if (m.pool_member?.user_id) {
          names.set(m.pool_member.user_id, m.pool_member.profiles?.display_name ?? '—')
        }
      }
      const scored = standings.filter((s) => s.cumulativeScore !== null)
      for (const s of scored) {
        const uid = userByTMember.get(s.memberId)
        if (!uid) continue
        combined.set(uid, (combined.get(uid) ?? 0) + (s.cumulativeScore ?? 0))
      }
      const winnerUid = scored.length > 0 ? userByTMember.get(scored[0].memberId) : undefined
      if (winnerUid) wins.set(winnerUid, (wins.get(winnerUid) ?? 0) + 1)
    }

    const sorted = [...names.keys()].sort(
      (a, b) =>
        (wins.get(b) ?? 0) - (wins.get(a) ?? 0) ||
        (combined.get(a) ?? 0) - (combined.get(b) ?? 0)
    )
    return {
      rows: sorted.map((uid, i) => ({
        rank: i + 1,
        user_id: uid,
        display_name: names.get(uid) ?? '—',
        points: wins.get(uid) ?? 0,
        detail: `${wins.get(uid) ?? 0} tournament win${(wins.get(uid) ?? 0) === 1 ? '' : 's'}`,
      })),
      championUserId: null,
    }
  }

  throw new Error(`Unsupported game type: ${pool.game_type}`)
}
