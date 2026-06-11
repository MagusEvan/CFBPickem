import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWorldCupProvider } from '@/lib/data-providers/world-cup/provider'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year') || 2026)
  const stage = request.nextUrl.searchParams.get('stage')

  // Check cache
  const admin = createAdminClient()
  let query = admin
    .from('cached_games')
    .select('*')
    .eq('game_type', 'world_cup')
    .eq('season_year', year)

  if (stage) {
    query = query.eq('stage', stage)
  }

  const { data: cached } = await query
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const isFresh = cached && cached.length > 0 &&
    cached.every((g) => g.fetched_at > fifteenMinAgo)

  if (isFresh) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    })
  }

  // Fetch from ESPN and cache
  try {
    const provider = getWorldCupProvider()
    const games = stage
      ? await provider.getGamesByStage(year, stage as Parameters<typeof provider.getGamesByStage>[1])
      : await provider.getAllGames(year)

    const rows = games.map((g) => ({
      id: g.id,
      season_year: year,
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
      await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
    }

    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    })
  } catch (err) {
    if (cached && cached.length > 0) {
      return NextResponse.json(cached)
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch World Cup games' },
      { status: 500 }
    )
  }
}

// Manual game entry/update by pool admin
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    id, season_year, home_team_id, away_team_id, home_score, away_score,
    stage, is_overtime, is_shootout, home_penalty_score, away_penalty_score,
    start_time, venue, status,
  } = body

  if (!home_team_id || !away_team_id || !stage) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify the user is an admin of a WC pool for this season
  const admin = createAdminClient()
  const { data: adminPool } = await admin
    .from('pools')
    .select('id')
    .eq('admin_id', user.id)
    .eq('game_type', 'world_cup')
    .eq('season_year', season_year || 2026)
    .limit(1)
    .maybeSingle()

  if (!adminPool) {
    return NextResponse.json({ error: 'Only league admins can modify game data' }, { status: 403 })
  }
  const gameId = id || `manual_${home_team_id}_${away_team_id}_${stage}_${Date.now()}`

  const { data, error } = await admin.from('cached_games').upsert({
    id: gameId,
    season_year: season_year || 2026,
    week: null,
    home_team_id,
    away_team_id,
    home_score: home_score ?? null,
    away_score: away_score ?? null,
    status: status || 'final',
    start_time: start_time || null,
    venue: venue || null,
    game_type: 'world_cup',
    stage,
    is_overtime: is_overtime || false,
    is_shootout: is_shootout || false,
    home_penalty_score: home_penalty_score ?? null,
    away_penalty_score: away_penalty_score ?? null,
    manual_entry: true,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
