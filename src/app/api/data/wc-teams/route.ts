import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWorldCupTeams } from '@/lib/data-providers/world-cup/teams'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year') || 2026)

  // Check cache
  const admin = createAdminClient()
  const { data: cached } = await admin
    .from('cached_teams')
    .select('*')
    .eq('game_type', 'world_cup')
    .eq('season_year', year)

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const isFresh = cached && cached.length >= 48 &&
    cached.every((t) => t.fetched_at > sixHoursAgo)

  if (isFresh) {
    return NextResponse.json(cached)
  }

  // Load from static data and upsert into cache
  const teams = getWorldCupTeams(year)
  const rows = teams.map((t) => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    conference_key: null, // WC teams have no conference
    logo_url: t.flagUrl,
    color_primary: null,
    color_secondary: null,
    season_year: year,
    wins: 0,
    losses: 0,
    game_type: 'world_cup' as const,
    fetched_at: new Date().toISOString(),
  }))

  if (rows.length > 0) {
    await admin.from('cached_teams').upsert(rows, { onConflict: 'id,season_year' })
  }

  return NextResponse.json(rows)
}
