import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Staleness-gated, deduplicated refresh of externally sourced data (ESPN).
 *
 * Pages call ensureFresh* before reading cached data. If the resource was
 * refreshed within STALE_MS, this is a single cheap read. Otherwise exactly
 * one caller "claims" the refresh (atomic conditional update on the
 * data_refresh table) and fetches from ESPN; concurrent callers serve the
 * existing cache. Fetch failures are swallowed — stale data is better than
 * an error page, and the claim prevents hammering a failing API.
 */

const STALE_MS = 5 * 60 * 1000

type Admin = ReturnType<typeof createAdminClient>

async function claimRefresh(admin: Admin, resource: string): Promise<boolean> {
  // Ensure the row exists (epoch default makes a new row immediately claimable)
  await admin
    .from('data_refresh')
    .upsert({ resource }, { onConflict: 'resource', ignoreDuplicates: true })

  // Atomically claim: only one concurrent caller's update matches the filter
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString()
  const { data } = await admin
    .from('data_refresh')
    .update({ last_refreshed_at: new Date().toISOString() })
    .eq('resource', resource)
    .lt('last_refreshed_at', staleBefore)
    .select('resource')

  return (data?.length ?? 0) > 0
}

export async function ensureFreshGames(
  gameType: 'cfb' | 'world_cup' | 'pga',
  seasonYear: number
): Promise<void> {
  if (gameType === 'pga') return // PGA uses ensureFreshGolfers per tournament

  const admin = createAdminClient()
  try {
    if (!(await claimRefresh(admin, `games:${gameType}:${seasonYear}`))) return
    if (gameType === 'world_cup') {
      await refreshWcGames(admin, seasonYear)
    } else {
      await refreshCfbGames(admin, seasonYear)
    }
  } catch (err) {
    console.error(`ensureFreshGames(${gameType}, ${seasonYear}) failed:`, err)
  }
}

export async function ensureFreshGolfers(
  tournamentId: string,
  espnEventId: string | null
): Promise<void> {
  if (!espnEventId) return

  const admin = createAdminClient()
  try {
    if (!(await claimRefresh(admin, `golfers:${tournamentId}`))) return
    await fetchAndCacheGolfers(admin, tournamentId, espnEventId)
  } catch (err) {
    console.error(`ensureFreshGolfers(${tournamentId}) failed:`, err)
  }
}

async function refreshWcGames(admin: Admin, seasonYear: number): Promise<void> {
  const { getWorldCupProvider } = await import('@/lib/data-providers/world-cup/provider')
  const provider = getWorldCupProvider()
  const games = await provider.getAllGames(seasonYear)

  const rows = games.map((g) => ({
    id: g.id,
    season_year: seasonYear,
    week: null,
    home_team_id: g.homeTeam.id,
    away_team_id: g.awayTeam.id,
    home_score: g.homeTeam.score,
    away_score: g.awayTeam.score,
    status: g.status,
    status_detail: g.statusDetail,
    start_time: g.startTime,
    venue: g.venue,
    game_type: 'world_cup' as const,
    stage: g.stage,
    is_overtime: g.isOvertime,
    is_shootout: g.isShootout,
    home_penalty_score: g.homePenaltyScore,
    away_penalty_score: g.awayPenaltyScore,
    manual_entry: false,
    broadcasts: g.broadcasts.length > 0 ? g.broadcasts : null,
    fetched_at: new Date().toISOString(),
  }))

  if (rows.length > 0) {
    const { error } = await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`DB upsert failed: ${error.message}`)
  }
}

async function refreshCfbGames(admin: Admin, seasonYear: number): Promise<void> {
  const { getDataProvider } = await import('@/lib/data-providers')
  const provider = getDataProvider()

  // Fetch all 15 weeks in parallel
  const weeks = Array.from({ length: 15 }, (_, i) => i + 1)
  const allGames = await Promise.all(
    weeks.map((week) => provider.getGamesForWeek(seasonYear, week))
  )

  const now = new Date().toISOString()
  const rows = allGames.flat().map((g) => ({
    id: g.id,
    season_year: g.seasonYear,
    week: g.week,
    home_team_id: g.homeTeam.id,
    away_team_id: g.awayTeam.id,
    home_score: g.homeTeam.score,
    away_score: g.awayTeam.score,
    status: g.status,
    status_detail: g.statusDetail,
    start_time: g.startTime,
    venue: g.venue,
    broadcasts: g.broadcasts.length > 0 ? g.broadcasts : null,
    fetched_at: now,
  }))

  if (rows.length > 0) {
    const { error } = await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`DB upsert failed: ${error.message}`)
  }
}

export async function fetchAndCacheGolfers(
  admin: Admin,
  tournamentId: string,
  espnEventId: string
): Promise<void> {
  const { getPgaProvider } = await import('@/lib/data-providers/pga/provider')
  const provider = getPgaProvider()
  const golfers = await provider.getEventGolfers(espnEventId)

  if (golfers.length > 0) {
    const rows = golfers.map((g) => ({
      id: g.id,
      tournament_id: tournamentId,
      name: g.name,
      amateur: g.amateur,
      country: g.country,
      image_url: g.imageUrl,
      status: g.status,
      position: g.position,
      total_score: g.totalScore,
      total_strokes: g.totalStrokes,
      r1_score: g.roundScores[0] ?? null,
      r2_score: g.roundScores[1] ?? null,
      r3_score: g.roundScores[2] ?? null,
      r4_score: g.roundScores[3] ?? null,
      r1_strokes: g.roundStrokes[0] ?? null,
      r2_strokes: g.roundStrokes[1] ?? null,
      r3_strokes: g.roundStrokes[2] ?? null,
      r4_strokes: g.roundStrokes[3] ?? null,
      tee_time: g.teeTime,
      thru: g.thru,
      fetched_at: new Date().toISOString(),
    }))

    const { error } = await admin
      .from('pga_golfers')
      .upsert(rows, { onConflict: 'id,tournament_id' })
    if (error) throw new Error(error.message)
  }

  // Also update course par if we can extract it from ESPN
  try {
    const par = await provider.getEventCoursePar(espnEventId)
    if (par !== null) {
      await admin.from('pga_tournaments').update({ course_par: par }).eq('id', tournamentId)
    }
  } catch {
    // Non-fatal
  }
}
