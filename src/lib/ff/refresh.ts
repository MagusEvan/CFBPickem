import { createAdminClient } from '@/lib/supabase/admin'
import { claimRefresh } from '@/lib/data-refresh'
import { getNflProvider } from '@/lib/data-providers/nfl/provider'
import type { NflGameData } from '@/lib/data-providers/nfl/types'

/**
 * NFL data ingestion for fantasy football, gated via the shared data_refresh
 * table (see src/lib/data-refresh/index.ts). Three resources with different
 * staleness windows:
 *
 *   ff_players:{year}   player catalog (32 roster fetches)     24h
 *   ff_schedule:{year}  full-season game schedule (18 weeks)   24h
 *   ff_stats:{year}     current-week scores + box scores       90s live / 5min
 *
 * All ensureFresh* helpers swallow fetch failures — stale data beats an
 * error page, and the claim prevents hammering a failing API.
 */

type Admin = ReturnType<typeof createAdminClient>

const DAY_MS = 24 * 60 * 60 * 1000
const LIVE_MS = 90 * 1000
const IDLE_MS = 5 * 60 * 1000
const REGULAR_SEASON_WEEKS = 18
const FETCH_CONCURRENCY = 6

/**
 * Concurrency-capped Promise.allSettled — keeps roster (32), schedule (18),
 * and box-score (≤16) fan-outs from bursting ESPN and tripping rate limits.
 */
async function mapSettled<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(workers)
  return results
}

// ============================================================
// Player catalog
// ============================================================

// ESPN roster position -> fantasy position (others are dropped: OL, IDP, etc.)
const FANTASY_POSITIONS: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  PK: 'K',
  K: 'K',
}

// Static positional heuristic for default_rank (no free ADP source from ESPN).
// Used only for draft-board default sort + timer autopick.
const POSITION_PRIORITY: Record<string, number> = { RB: 1, WR: 2, QB: 3, TE: 4, K: 5, DST: 6 }

export async function ensureFreshPlayerCatalog(seasonYear: number): Promise<void> {
  const admin = createAdminClient()
  try {
    if (!(await claimRefresh(admin, `ff_players:${seasonYear}`, DAY_MS))) return
    await refreshPlayerCatalog(admin)
  } catch (err) {
    console.error(`ensureFreshPlayerCatalog(${seasonYear}) failed:`, err)
  }
}

export async function refreshPlayerCatalog(admin: Admin): Promise<void> {
  const provider = getNflProvider()
  const teams = await provider.getTeams()
  if (teams.length === 0) return

  const fetchedAt = new Date().toISOString()

  // 32 roster fetches; tolerate partial failures (those teams keep stale rows)
  const rosterResults = await mapSettled(teams, (t) => provider.getTeamRoster(t))
  const players = rosterResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter((p) => FANTASY_POSITIONS[p.position])

  const rows = players.map((p) => ({
    id: p.id,
    name: p.name,
    first_name: p.firstName,
    last_name: p.lastName,
    position: FANTASY_POSITIONS[p.position],
    nfl_team_id: p.nflTeamId,
    nfl_team_abbrev: p.nflTeamAbbrev,
    jersey: p.jersey,
    headshot_url: p.headshotUrl,
    status: p.status,
    injury_status: p.injuryStatus,
    active: true,
    fetched_at: fetchedAt,
  }))

  // Synthesized team-defense rows
  for (const t of teams) {
    rows.push({
      id: `DST-${t.abbreviation}`,
      name: `${t.displayName} D/ST`,
      first_name: null,
      last_name: null,
      position: 'DST',
      nfl_team_id: t.id,
      nfl_team_abbrev: t.abbreviation,
      jersey: null,
      headshot_url: t.logoUrl,
      status: 'active',
      injury_status: null,
      active: true,
      fetched_at: fetchedAt,
    })
  }

  // default_rank: position priority, then name within position (stable)
  const rankById = new Map<string, number>()
  for (const [position, priority] of Object.entries(POSITION_PRIORITY)) {
    rows
      .filter((r) => r.position === position)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((r, idx) => rankById.set(r.id, priority * 10000 + idx))
  }
  const ranked = rows.map((row) => ({ ...row, default_rank: rankById.get(row.id) ?? null }))

  // Upsert in chunks (~1,700 rows) to stay under payload limits
  for (let i = 0; i < ranked.length; i += 500) {
    const { error } = await admin.from('ff_players').upsert(ranked.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }

  // Players no longer on any roster (cut/retired) become inactive but keep
  // their rows — rosters/picks/stats reference them by FK.
  const rosterFetchesComplete = rosterResults.every((r) => r.status === 'fulfilled')
  if (rosterFetchesComplete) {
    await admin.from('ff_players').update({ active: false }).lt('fetched_at', fetchedAt)
  }
}

// ============================================================
// Season schedule
// ============================================================

export async function ensureFreshSchedule(seasonYear: number): Promise<void> {
  const admin = createAdminClient()
  try {
    if (!(await claimRefresh(admin, `ff_schedule:${seasonYear}`, DAY_MS))) return
    await refreshSchedule(admin, seasonYear)
  } catch (err) {
    console.error(`ensureFreshSchedule(${seasonYear}) failed:`, err)
  }
}

export async function refreshSchedule(admin: Admin, seasonYear: number): Promise<void> {
  const provider = getNflProvider()
  const weeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1)
  const results = await mapSettled(weeks, (w) => provider.getWeekGames(seasonYear, w))
  const games = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
  if (games.length > 0) await upsertGames(admin, games)
}

async function upsertGames(admin: Admin, games: NflGameData[]): Promise<void> {
  const rows = games.map((g) => ({
    id: g.id,
    season_year: g.seasonYear,
    week: g.week,
    season_type: g.seasonType,
    home_team_id: g.homeTeamId,
    away_team_id: g.awayTeamId,
    home_score: g.homeScore,
    away_score: g.awayScore,
    status: g.status,
    status_detail: g.statusDetail,
    start_time: g.startTime,
    broadcasts: g.broadcasts,
    fetched_at: new Date().toISOString(),
  }))
  const { error } = await admin.from('ff_nfl_games').upsert(rows)
  if (error) throw new Error(error.message)
}

// ============================================================
// Current-week scores + player stats
// ============================================================

interface GameRow {
  id: string
  week: number
  status: 'scheduled' | 'in_progress' | 'final'
  start_time: string
}

/** Earliest week with a non-final game; season over -> last week. */
export function currentWeek(games: GameRow[]): number | null {
  if (games.length === 0) return null
  let maxWeek = 0
  let current: number | null = null
  for (const g of games) {
    maxWeek = Math.max(maxWeek, g.week)
    if (g.status !== 'final' && (current === null || g.week < current)) current = g.week
  }
  return current ?? maxWeek
}

/** 90s window while any current-week game is live (or past kickoff), else 5min. */
function statsStaleMs(weekGames: GameRow[], now = Date.now()): number {
  const live = weekGames.some(
    (g) =>
      g.status === 'in_progress' ||
      (g.status === 'scheduled' && new Date(g.start_time).getTime() <= now)
  )
  return live ? LIVE_MS : IDLE_MS
}

export async function ensureFreshStats(seasonYear: number): Promise<void> {
  const admin = createAdminClient()
  try {
    const { data: games } = await admin
      .from('ff_nfl_games')
      .select('id, week, status, start_time')
      .eq('season_year', seasonYear)
      .eq('season_type', 2)

    const week = currentWeek((games as GameRow[] | null) ?? [])
    if (week === null) return // schedule not ingested yet

    const weekGames = (games as GameRow[]).filter((g) => g.week === week)
    const staleMs = statsStaleMs(weekGames)

    if (!(await claimRefresh(admin, `ff_stats:${seasonYear}`, staleMs))) return
    await refreshWeekStats(admin, seasonYear, week)
  } catch (err) {
    console.error(`ensureFreshStats(${seasonYear}) failed:`, err)
  }
}

export async function refreshWeekStats(
  admin: Admin,
  seasonYear: number,
  week: number
): Promise<void> {
  const provider = getNflProvider()

  // Refresh the week's scoreboard (scores + status drive matchup pages/locks)
  const games = await provider.getWeekGames(seasonYear, week)
  if (games.length > 0) await upsertGames(admin, games)

  // Box scores for started games; skip finals whose stats are already stored
  const started = games.filter((g) => g.status !== 'scheduled')
  const finalIds = started.filter((g) => g.status === 'final').map((g) => g.id)

  let ingestedFinalIds = new Set<string>()
  if (finalIds.length > 0) {
    const { data } = await admin
      .from('ff_player_stats')
      .select('nfl_game_id')
      .eq('season_year', seasonYear)
      .eq('week', week)
      .in('nfl_game_id', finalIds)
    ingestedFinalIds = new Set((data ?? []).map((r) => r.nfl_game_id as string))
  }

  const toFetch = started.filter((g) => g.status === 'in_progress' || !ingestedFinalIds.has(g.id))
  if (toFetch.length === 0) return

  // ≤16 summary calls (concurrency-capped); tolerate partial failures
  const summaries = await mapSettled(toFetch, (g) => provider.getGameStats(g.id))

  for (const result of summaries) {
    if (result.status !== 'fulfilled') continue
    const { gameId, statLines, athletes } = result.value
    const playerIds = Object.keys(statLines)
    if (playerIds.length === 0) continue

    // Stub rows for athletes not in the catalog (practice-squad elevations,
    // mid-week signings) so the stats FK holds. Catalog refresh fills them in.
    const stubs = playerIds
      .filter((id) => athletes[id])
      .map((id) => ({
        id,
        name: athletes[id].name,
        position: athletes[id].position ?? 'RB',
        active: true,
      }))
    if (stubs.length > 0) {
      const { error } = await admin
        .from('ff_players')
        .upsert(stubs, { ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    }

    const statRows = playerIds.map((playerId) => ({
      player_id: playerId,
      season_year: seasonYear,
      week,
      nfl_game_id: gameId,
      stats: statLines[playerId],
      fetched_at: new Date().toISOString(),
    }))
    const { error } = await admin.from('ff_player_stats').upsert(statRows)
    if (error) throw new Error(error.message)
  }
}

/** Convenience for score-bearing pages: schedule + current-week stats. */
export async function ensureFreshFfData(seasonYear: number): Promise<void> {
  await ensureFreshSchedule(seasonYear)
  await ensureFreshStats(seasonYear)
}
