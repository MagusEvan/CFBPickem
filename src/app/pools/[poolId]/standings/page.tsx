import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { calculateStandings } from '@/lib/scoring/engine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DraftPick, CachedTeam, TeamScraps } from '@/lib/types'

export default async function StandingsPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
  ])

  if (!pool) notFound()

  const supabase = await createClient()

  const [picksRes, teamsRes, scrapsRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId),
    supabase.from('cached_teams').select('*').eq('season_year', pool.season_year),
    supabase.from('team_scraps').select('*').eq('pool_id', poolId),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const teams = (teamsRes.data ?? []) as CachedTeam[]
  const scraps = (scrapsRes.data ?? []) as TeamScraps[]

  if (pool.draft_status === 'pre_draft') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Standings</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Standings will be available after the draft is complete.
          </CardContent>
        </Card>
      </div>
    )
  }

  const standings = calculateStandings(members, picks, teams, pool.scoring_strategy)
  const teamMap = new Map(teams.map((t) => [t.id, t]))

  // Calculate Team Scraps total wins
  const scrapsTotal = scraps.reduce((sum, s) => {
    const team = teamMap.get(s.team_id)
    return sum + (team?.wins ?? s.wins)
  }, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Standings</h1>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-2 text-left">Rank</th>
                <th className="px-2 py-2 text-left">Manager</th>
                <th className="px-2 py-2 text-center">W</th>
                <th className="px-2 py-2 text-center">L</th>
                <th className="px-2 py-2 text-center">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.memberId} className="border-b">
                  <td className="px-2 py-2 font-medium">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/pools/${poolId}/rosters/${s.memberId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {s.displayName}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-center">{s.totalWins}</td>
                  <td className="px-2 py-2 text-center">{s.totalLosses}</td>
                  <td className="px-2 py-2 text-center font-bold">{s.totalPoints}</td>
                </tr>
              ))}
              {/* Team Scraps row */}
              <tr className="border-b bg-muted/30">
                <td className="px-2 py-2 text-muted-foreground">—</td>
                <td className="px-2 py-2 text-muted-foreground italic">Team Scraps</td>
                <td className="px-2 py-2 text-center text-muted-foreground">{scrapsTotal}</td>
                <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                <td className="px-2 py-2 text-center font-bold text-muted-foreground">{scrapsTotal}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Team Scraps detail */}
      {scraps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Team Scraps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {scraps.map((s) => {
                const team = teamMap.get(s.team_id)
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      {team?.logo_url && (
                        <img src={team.logo_url} alt={s.team_name} className="h-6 w-6 object-contain" />
                      )}
                      <span className="text-sm font-medium">{s.team_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{s.conference_key}</Badge>
                      <span className="text-sm">{team?.wins ?? s.wins}W</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
