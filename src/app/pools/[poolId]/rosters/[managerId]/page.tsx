import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import type { DraftPick, CachedTeam, CachedGame, WorldCupScoringConfig } from '@/lib/types'
import { calculateTeamPoints } from '@/lib/scoring/strategies/world-cup'

export const revalidate = 60

const DEFAULT_WC_SCORING: WorldCupScoringConfig = {
  group: { win: 6, draw: 3, goal_points: 1, goal_cap: 3, shutout: 1 },
  knockout: {
    win: 6, ot_win: 5, shootout_win: 4, shootout_loss: 2, ot_loss: 1, loss: 0,
    goal_points: 1, goal_cap: null, shutout: 1,
  },
}

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
  const isWorldCup = pool.game_type === 'world_cup'

  const [picksRes, teamsRes, gamesRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId).eq('member_id', managerId).order('round'),
    supabase.from('cached_teams').select('*').eq('season_year', pool.season_year),
    isWorldCup
      ? supabase.from('cached_games').select('*').eq('game_type', 'world_cup').eq('season_year', pool.season_year)
      : Promise.resolve({ data: null }),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const teams = (teamsRes.data ?? []) as CachedTeam[]
  const teamMap = new Map(teams.map((t) => [t.id, t]))
  const games = (gamesRes.data ?? []) as CachedGame[]
  const scoringConfig = (pool.scoring_config ?? DEFAULT_WC_SCORING) as WorldCupScoringConfig

  // Calculate per-team stats
  const teamStats = picks.map((pick) => {
    if (isWorldCup) {
      const { totalPoints, breakdown } = calculateTeamPoints(games, pick.team_id, scoringConfig)
      return { pick, totalPoints, gamesPlayed: breakdown.length, wins: 0, losses: 0 }
    }
    const team = teamMap.get(pick.team_id)
    return { pick, totalPoints: 0, gamesPlayed: 0, wins: team?.wins ?? 0, losses: team?.losses ?? 0 }
  })

  const aggPoints = teamStats.reduce((sum, s) => sum + s.totalPoints, 0)
  const aggWins = teamStats.reduce((sum, s) => sum + s.wins, 0)
  const aggLosses = teamStats.reduce((sum, s) => sum + s.losses, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/pools/${poolId}/standings`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Standings
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold">{member.profiles.display_name}&apos;s Roster</h1>
        <p className="text-muted-foreground">
          {isWorldCup
            ? `${aggPoints} pts · ${picks.length} teams`
            : `${aggWins}W - ${aggLosses}L · ${picks.length} teams`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {teamStats.map((stat) => {
          const team = teamMap.get(stat.pick.team_id)
          return (
            <Card key={stat.pick.id}>
              <CardContent className="flex items-center gap-4 py-4">
                {team?.logo_url && (
                  <img src={team.logo_url} alt={stat.pick.team_name} className="h-12 w-12 object-contain" />
                )}
                <div className="flex-1">
                  <p className="font-semibold">
                    {stat.pick.team_name}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">(r{stat.pick.round})</span>
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {!isWorldCup && (
                      <Badge variant="outline" className="text-xs">{stat.pick.conference_key}</Badge>
                    )}
                    {stat.pick.is_bonus_pick && (
                      <Badge variant="secondary" className="text-xs">Bonus</Badge>
                    )}
                    {isWorldCup && (
                      <span>{stat.gamesPlayed} GP</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {isWorldCup ? (
                    <p className="text-lg font-bold">{stat.totalPoints} pts</p>
                  ) : (
                    <>
                      <p className="text-lg font-bold">{stat.wins}W</p>
                      <p className="text-sm text-muted-foreground">{stat.losses}L</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
