import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { DraftPick, CachedTeam } from '@/lib/types'

export default async function RosterPage({
  params,
}: {
  params: Promise<{ poolId: string; managerId: string }>
}) {
  const { poolId, managerId } = await params
  const [pool, members] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
  ])

  if (!pool) notFound()

  const member = members.find((m) => m.id === managerId)
  if (!member) notFound()

  const supabase = await createClient()
  const [picksRes, teamsRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId).eq('member_id', managerId).order('round'),
    supabase.from('cached_teams').select('*').eq('season_year', pool.season_year),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const teams = (teamsRes.data ?? []) as CachedTeam[]
  const teamMap = new Map(teams.map((t) => [t.id, t]))

  const totalWins = picks.reduce((sum, p) => sum + (teamMap.get(p.team_id)?.wins ?? 0), 0)
  const totalLosses = picks.reduce((sum, p) => sum + (teamMap.get(p.team_id)?.losses ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/pools/${poolId}/standings`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{member.profiles.display_name}&apos;s Roster</h1>
          <p className="text-muted-foreground">
            {totalWins}W - {totalLosses}L &middot; {picks.length} teams
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {picks.map((pick) => {
          const team = teamMap.get(pick.team_id)
          return (
            <Card key={pick.id}>
              <CardContent className="flex items-center gap-4 py-4">
                {team?.logo_url && (
                  <img src={team.logo_url} alt={pick.team_name} className="h-12 w-12 object-contain" />
                )}
                <div className="flex-1">
                  <p className="font-semibold">{pick.team_name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="text-xs">{pick.conference_key}</Badge>
                    <span>Round {pick.round}</span>
                    {pick.is_bonus_pick && (
                      <Badge variant="secondary" className="text-xs">Bonus</Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{team?.wins ?? 0}W</p>
                  <p className="text-sm text-muted-foreground">{team?.losses ?? 0}L</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
