import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentNflSeasonYear } from '@/lib/ff/settings'
import { RankingsTable, type AdminRankRow } from '@/components/admin/rankings-table'
import type { FFPlayer } from '@/lib/ff/types'

// Site-admin auth is enforced by the /admin layout
export default async function AdminRankingsPage() {
  const admin = createAdminClient()
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

  return (
    <div className="space-y-4">
      <Link
        href="/admin"
        className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Admin
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Player Rankings</h1>
        <p className="text-muted-foreground">
          Composite index (mean of available source ranks) drives draft board order and
          autopick. ESPN, Yahoo, Sleeper, and FantasyPros refresh automatically; any
          rank can also be edited by hand.
        </p>
      </div>
      <RankingsTable players={rows} seasonYear={currentNflSeasonYear()} />
    </div>
  )
}
