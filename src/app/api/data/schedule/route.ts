import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDataProvider } from '@/lib/data-providers'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year') || new Date().getFullYear())
  const week = Number(request.nextUrl.searchParams.get('week') || 1)

  const admin = createAdminClient()

  // Check cache
  const { data: cached } = await admin
    .from('cached_games')
    .select('*')
    .eq('season_year', year)
    .eq('week', week)

  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const isFresh = cached && cached.length > 0 && cached[0].fetched_at > fifteenMinsAgo

  if (isFresh) {
    return NextResponse.json(cached)
  }

  try {
    const provider = getDataProvider()
    const games = await provider.getGamesForWeek(year, week)

    const rows = games.map((g) => ({
      id: g.id,
      season_year: g.seasonYear,
      week: g.week,
      home_team_id: g.homeTeam.id,
      away_team_id: g.awayTeam.id,
      home_score: g.homeTeam.score,
      away_score: g.awayTeam.score,
      status: g.status,
      start_time: g.startTime,
      venue: g.venue,
      fetched_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
    }

    return NextResponse.json(rows)
  } catch (err) {
    if (cached && cached.length > 0) {
      return NextResponse.json(cached)
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch schedule' },
      { status: 500 }
    )
  }
}
