import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ConferenceLogo } from '@/components/conference-logo'
import type { DraftPick, CachedTeam, CachedGame, WorldCupScoringConfig } from '@/lib/types'
import { calculateTeamPoints, type GamePointBreakdown } from '@/lib/scoring/strategies/world-cup'

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
      ? supabase.from('cached_games').select('id,home_team_id,away_team_id,home_score,away_score,status,stage,is_overtime,is_shootout,home_penalty_score,away_penalty_score').eq('game_type', 'world_cup').eq('season_year', pool.season_year)
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
      return { pick, totalPoints, gamesPlayed: breakdown.length, wins: 0, losses: 0, breakdown }
    }
    const team = teamMap.get(pick.team_id)
    return { pick, totalPoints: 0, gamesPlayed: 0, wins: team?.wins ?? 0, losses: team?.losses ?? 0, breakdown: [] as GamePointBreakdown[] }
  })

  // Aggregate scoring categories per team
  const categoryOrder = ['Win', 'Draw', 'OT Win', 'PK Win', 'PK Loss', 'OT Loss', 'Goals', 'Shutout']
  const shortLabel: Record<string, string> = {
    'Win': 'W', 'Draw': 'D', 'OT Win': 'OTW', 'PK Win': 'PKW',
    'PK Loss': 'PKL', 'OT Loss': 'OTL', 'Goals': 'G', 'Shutout': 'SO',
  }

  function aggregateCategories(breakdown: GamePointBreakdown[]) {
    const totals: Record<string, number> = {}
    for (const gb of breakdown) {
      for (const item of gb.itemized) {
        totals[item.label] = (totals[item.label] ?? 0) + item.value
      }
    }
    return totals
  }

  // Find which categories are active across all teams
  const allCategories = new Map<string, number>()
  for (const stat of teamStats) {
    const cats = aggregateCategories(stat.breakdown)
    for (const [label, val] of Object.entries(cats)) {
      allCategories.set(label, (allCategories.get(label) ?? 0) + val)
    }
  }
  const activeCategories = categoryOrder.filter((c) => allCategories.has(c))

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

      {isWorldCup ? (
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-2 text-left">Team</th>
                  <th className="px-2 py-2 text-center text-xs">GP</th>
                  {activeCategories.map((cat) => (
                    <th key={cat} className="px-2 py-2 text-center text-xs" title={cat}>
                      {shortLabel[cat] ?? cat}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center">Pts</th>
                </tr>
              </thead>
              <tbody>
                {teamStats
                  .sort((a, b) => b.totalPoints - a.totalPoints)
                  .map((stat) => {
                    const team = teamMap.get(stat.pick.team_id)
                    const cats = aggregateCategories(stat.breakdown)
                    return (
                      <tr key={stat.pick.id} className="border-b">
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            {team?.logo_url && (
                              <Image src={team.logo_url} alt={stat.pick.team_name} width={24} height={24} className="h-6 w-6 object-contain" />
                            )}
                            <span className="font-medium">{stat.pick.team_name}</span>
                            <span className="text-xs text-muted-foreground">(r{stat.pick.round})</span>
                            {stat.pick.is_bonus_pick && (
                              <Badge variant="secondary" className="text-xs">Bonus</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">{stat.gamesPlayed}</td>
                        {activeCategories.map((cat) => (
                          <td key={cat} className="px-2 py-2 text-center">{cats[cat] ?? 0}</td>
                        ))}
                        <td className="px-2 py-2 text-center font-bold">{stat.totalPoints}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {teamStats.map((stat) => {
            const team = teamMap.get(stat.pick.team_id)
            return (
              <Card key={stat.pick.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  {team?.logo_url && (
                    <Image src={team.logo_url} alt={stat.pick.team_name} width={48} height={48} className="h-12 w-12 object-contain" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">
                      {stat.pick.team_name}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">(r{stat.pick.round})</span>
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="outline" className="gap-1 text-xs">
                        <ConferenceLogo conferenceKey={stat.pick.conference_key} size={14} />
                        {stat.pick.conference_key}
                      </Badge>
                      {stat.pick.is_bonus_pick && (
                        <Badge variant="secondary" className="text-xs">Bonus</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{stat.wins}W</p>
                    <p className="text-sm text-muted-foreground">{stat.losses}L</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
