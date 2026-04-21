import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDataProvider } from '@/lib/data-providers'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conferenceKey = request.nextUrl.searchParams.get('conference')
  const year = Number(request.nextUrl.searchParams.get('year') || new Date().getFullYear())

  // Check cache first
  const admin = createAdminClient()
  let query = admin
    .from('cached_teams')
    .select('*')
    .eq('season_year', year)

  if (conferenceKey) {
    query = query.eq('conference_key', conferenceKey)
  }

  const { data: cached } = await query
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  // Cache is fresh only if we have data AND the oldest entry is recent
  // For "all teams" requests, also check we have multiple conferences cached
  const isFresh = cached && cached.length > 0 &&
    cached.every((t) => t.fetched_at > sixHoursAgo) &&
    (conferenceKey || new Set(cached.map((t) => t.conference_key)).size >= 5)

  if (isFresh) {
    return NextResponse.json(cached)
  }

  // Fetch from provider and update cache
  try {
    const provider = getDataProvider()
    const teams = conferenceKey
      ? await provider.getTeamsByConference(conferenceKey, year)
      : await provider.getAllFbsTeams(year)

    // Upsert into cache
    const rows = teams.map((t) => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      conference_key: t.conferenceKey,
      logo_url: t.logoUrl,
      color_primary: t.colorPrimary,
      color_secondary: t.colorSecondary,
      season_year: year,
      fetched_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      await admin.from('cached_teams').upsert(rows, { onConflict: 'id,season_year' })
    }

    return NextResponse.json(rows)
  } catch (err) {
    // Return stale cache if available
    if (cached && cached.length > 0) {
      return NextResponse.json(cached)
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch teams' },
      { status: 500 }
    )
  }
}
