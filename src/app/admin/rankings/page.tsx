import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RankingsTable, type AdminRankRow } from '@/components/admin/rankings-table'
import type { FFPlayer } from '@/lib/ff/types'

export default async function AdminRankingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('is_site_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_site_admin) notFound()

  const { data } = await admin
    .from('ff_players')
    .select('*')
    .eq('active', true)
    .order('default_rank', { ascending: true, nullsFirst: false })
  const players = (data ?? []) as FFPlayer[]

  const rows: AdminRankRow[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    team: p.nfl_team_abbrev,
    espn: p.rank_espn,
    yahoo: p.rank_yahoo,
    sleeper: p.rank_sleeper,
    fantasypros: p.rank_fantasypros,
    composite: p.rank_composite,
    compositeOverride: p.rank_composite_override,
  }))

  // NFL season year (Jan/Feb pages still belong to the prior season)
  const now = new Date()
  const seasonYear = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Player Rankings</h1>
        <p className="text-muted-foreground">
          Composite index (mean of available source ranks) drives draft board order and
          autopick. ESPN, Yahoo, Sleeper, and FantasyPros refresh automatically; any
          rank can also be edited by hand.
        </p>
      </div>
      <RankingsTable players={rows} seasonYear={seasonYear} />
    </div>
  )
}
