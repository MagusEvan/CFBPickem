import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchCfbWinTotals, matchWinTotals } from '@/lib/data-providers/vegasinsider/win-totals'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { poolId } = (await request.json()) as { poolId: string }
  if (!poolId) return NextResponse.json({ error: 'poolId required' }, { status: 400 })

  const { data: pool } = await supabase
    .from('pools')
    .select('admin_id, season_year, game_type')
    .eq('id', poolId)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  if (pool.admin_id !== user.id) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  if (pool.game_type !== 'cfb') return NextResponse.json({ error: 'CFB pools only' }, { status: 400 })

  const admin = createAdminClient()
  const { data: teams } = await admin
    .from('cached_teams')
    .select('id, name')
    .eq('season_year', pool.season_year)
    .eq('game_type', 'cfb')

  if (!teams || teams.length === 0) {
    return NextResponse.json({ error: 'No cached teams — open the draft first' }, { status: 400 })
  }

  try {
    const entries = await fetchCfbWinTotals()
    const { byTeamName, unmatched } = matchWinTotals(entries, teams.map((t) => t.name))

    await Promise.all(
      teams
        .filter((t) => byTeamName.has(t.name))
        .map((t) =>
          admin
            .from('cached_teams')
            .update({ projected_wins: byTeamName.get(t.name)! })
            .eq('id', t.id)
            .eq('season_year', pool.season_year)
        )
    )

    return NextResponse.json({ updated: byTeamName.size, unmatched })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch win totals' },
      { status: 502 }
    )
  }
}
