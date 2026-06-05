import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { calculateStandings, calculateWorldCupStandings } from '@/lib/scoring/engine'
import { calculateTeamPoints } from '@/lib/scoring/strategies/world-cup'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DraftPick, CachedTeam, CachedGame, TeamScraps, WcScrapsTeam, WorldCupScoringConfig } from '@/lib/types'

const DEFAULT_WC_SCORING: WorldCupScoringConfig = {
  group: { win: 6, draw: 3, goal_points: 1, goal_cap: 3, shutout: 1 },
  knockout: {
    win: 6, ot_win: 5, shootout_win: 4, shootout_loss: 2,
    ot_loss: 1, loss: 0, goal_points: 1, goal_cap: null, shutout: 1,
  },
}

export default async function StandingsPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
  ])

  if (!pool) notFound()

  if (pool.draft_status === 'pre_draft') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Standings</h1>
        <Link href={`/pools/${poolId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Return to Pool
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Standings will be available after the draft is complete.
          </CardContent>
        </Card>
      </div>
    )
  }

  const supabase = await createClient()

  if (pool.game_type === 'world_cup') {
    return <WorldCupStandings poolId={poolId} pool={pool} members={members} />
  }

  // CFB standings
  const [picksRes, teamsRes, scrapsRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId),
    supabase.from('cached_teams').select('*').eq('season_year', pool.season_year),
    supabase.from('team_scraps').select('*').eq('pool_id', poolId),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const teams = (teamsRes.data ?? []) as CachedTeam[]
  const scraps = (scrapsRes.data ?? []) as TeamScraps[]

  const standings = calculateStandings(members, picks, teams, pool.scoring_strategy)
  const teamMap = new Map(teams.map((t) => [t.id, t]))

  const scrapsTotal = scraps.reduce((sum, s) => {
    const team = teamMap.get(s.team_id)
    return sum + (team?.wins ?? s.wins)
  }, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Standings</h1>
      <Link href={`/pools/${poolId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Return to Pool
      </Link>

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

async function WorldCupStandings({
  poolId,
  pool,
  members,
}: {
  poolId: string
  pool: { season_year: number; scoring_config: WorldCupScoringConfig | null }
  members: Parameters<typeof calculateWorldCupStandings>[0]
}) {
  const supabase = await createClient()

  const [picksRes, gamesRes, wcScrapsRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId),
    supabase.from('cached_games').select('*').eq('game_type', 'world_cup').eq('season_year', pool.season_year),
    supabase.from('wc_scraps_teams').select('*').eq('pool_id', poolId),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const games = (gamesRes.data ?? []) as CachedGame[]
  const wcScraps = (wcScrapsRes.data ?? []) as WcScrapsTeam[]
  const config = pool.scoring_config ?? DEFAULT_WC_SCORING

  const managerStandings = calculateWorldCupStandings(members, picks, games, config)

  // Build scraps team standings
  const scrapsTeamNumbers = [...new Set(wcScraps.map((s) => s.scraps_team_number))].sort()
  const scrapsStandings = scrapsTeamNumbers.map((num) => {
    const teamRows = wcScraps.filter((s) => s.scraps_team_number === num)
    const teamBreakdowns = teamRows.map((row) => {
      const { totalPoints: teamPts, breakdown } = calculateTeamPoints(games, row.team_id, config)
      return {
        teamId: row.team_id,
        teamName: row.team_name,
        points: teamPts,
        gamesPlayed: breakdown.length,
      }
    })
    return {
      scrapsTeamNumber: num,
      displayName: `Scraps Team ${num}`,
      totalPoints: teamBreakdowns.reduce((sum, tb) => sum + tb.points, 0),
      teamBreakdowns,
    }
  })

  // Merge managers and scraps into one sorted list
  type StandingEntry =
    | { type: 'manager'; memberId: string; displayName: string; totalPoints: number; teamBreakdowns: typeof managerStandings[0]['teamBreakdowns'] }
    | { type: 'scraps'; scrapsTeamNumber: number; displayName: string; totalPoints: number; teamBreakdowns: typeof scrapsStandings[0]['teamBreakdowns'] }

  const combined: StandingEntry[] = [
    ...managerStandings.map((s) => ({ type: 'manager' as const, ...s })),
    ...scrapsStandings.map((s) => ({ type: 'scraps' as const, ...s })),
  ].sort((a, b) => b.totalPoints - a.totalPoints)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Standings</h1>
      <Link href={`/pools/${poolId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Return to Pool
      </Link>

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
                <th className="px-2 py-2 text-center">Teams</th>
                <th className="px-2 py-2 text-center">Points</th>
              </tr>
            </thead>
            <tbody>
              {combined.map((s, i) => {
                const key = s.type === 'manager' ? s.memberId : `scraps-${s.scrapsTeamNumber}`
                const isScraps = s.type === 'scraps'
                return (
                  <tr key={key} className={`border-b ${isScraps ? 'bg-muted/30' : ''}`}>
                    <td className={`px-2 py-2 font-medium ${isScraps ? 'text-muted-foreground' : ''}`}>{i + 1}</td>
                    <td className={`px-2 py-2 ${isScraps ? 'text-muted-foreground italic' : ''}`}>
                      {s.type === 'manager' ? (
                        <Link
                          href={`/pools/${poolId}/rosters/${s.memberId}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {s.displayName}
                        </Link>
                      ) : (
                        s.displayName
                      )}
                    </td>
                    <td className={`px-2 py-2 text-center ${isScraps ? 'text-muted-foreground' : ''}`}>{s.teamBreakdowns.length}</td>
                    <td className={`px-2 py-2 text-center font-bold ${isScraps ? 'text-muted-foreground' : ''}`}>{s.totalPoints}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Per-entry team breakdowns */}
      {combined.map((s) => {
        const key = s.type === 'manager' ? s.memberId : `scraps-${s.scrapsTeamNumber}`
        const isScraps = s.type === 'scraps'
        return (
          <Card key={key} className={isScraps ? 'border-dashed' : ''}>
            <CardHeader>
              <CardTitle className="text-base">
                {s.displayName} — {s.totalPoints} pts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {s.teamBreakdowns
                  .sort((a, b) => b.points - a.points)
                  .map((tb) => (
                    <div key={tb.teamId} className="flex items-center justify-between rounded-md border p-2">
                      <span className="text-sm font-medium">{tb.teamName}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {tb.gamesPlayed} GP
                        </Badge>
                        <span className="text-sm font-bold">{tb.points} pts</span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
