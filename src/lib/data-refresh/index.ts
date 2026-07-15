import { createAdminClient } from '@/lib/supabase/admin'
import type { GameType } from '@/lib/types'
import { GAME_SERVERS } from '@/lib/games/server'

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

export async function claimRefresh(
  admin: Admin,
  resource: string,
  staleMs: number = STALE_MS
): Promise<boolean> {
  // Ensure the row exists (epoch default makes a new row immediately claimable)
  await admin
    .from('data_refresh')
    .upsert({ resource }, { onConflict: 'resource', ignoreDuplicates: true })

  // Atomically claim: only one concurrent caller's update matches the filter
  const staleBefore = new Date(Date.now() - staleMs).toISOString()
  const { data } = await admin
    .from('data_refresh')
    .update({ last_refreshed_at: new Date().toISOString() })
    .eq('resource', resource)
    .lt('last_refreshed_at', staleBefore)
    .select('resource')

  return (data?.length ?? 0) > 0
}

export async function ensureFreshGames(
  gameType: GameType,
  seasonYear: number
): Promise<void> {
  const refreshGames = GAME_SERVERS[gameType].refreshGames
  if (!refreshGames) return // e.g. PGA uses ensureFreshGolfers per tournament

  const admin = createAdminClient()
  try {
    if (!(await claimRefresh(admin, `games:${gameType}:${seasonYear}`))) return
    await refreshGames(admin, seasonYear)
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

    // Prune golfers who dropped out of the ESPN field (e.g. the preliminary
    // entry list shrinking to the final field), but never drafted ones —
    // picks reference golfer rows for scoring.
    const { data: picks } = await admin
      .from('pga_draft_picks')
      .select('golfer_id')
      .eq('tournament_id', tournamentId)
    const keepIds = new Set([
      ...golfers.map((g) => g.id),
      ...(picks ?? []).map((p) => p.golfer_id as string),
    ])
    await admin
      .from('pga_golfers')
      .delete()
      .eq('tournament_id', tournamentId)
      .not('id', 'in', `(${[...keepIds].join(',')})`)
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
