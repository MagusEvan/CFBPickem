import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import {
  getFfCurrentWeek,
  getFfWeekGames,
  getFfWeekStats,
  getFfLineups,
  getFfMatchups,
  getFfPlayersByIds,
} from '@/lib/ff/queries'
import { resolveLeagueSettings, resolveScoringSettings } from '@/lib/ff/settings'
import { computeFantasyPoints, isStarterSlot, round2 } from '@/lib/ff/scoring'
import { sortSlots } from '@/lib/ff/roster'
import { MatchupLive } from '@/components/ff/matchup-live'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { FFLineupSlot } from '@/lib/ff/types'

export const revalidate = 30

export default async function MatchupWeekPage({
  params,
}: {
  params: Promise<{ poolId: string; week: string }>
}) {
  const { poolId, week: weekParam } = await params
  const week = Number.parseInt(weekParam, 10)
  if (!Number.isInteger(week) || week < 1) notFound()

  const [pool, members] = await Promise.all([getPool(poolId), getPoolMembers(poolId)])
  if (!pool || pool.game_type !== 'ff') notFound()

  const settings = resolveLeagueSettings(pool)
  if (week > settings.season.regularSeasonWeeks) notFound()

  const currentWeek = await getFfCurrentWeek(pool.season_year)
  const [games, statsByPlayer, lineups, matchups] = await Promise.all([
    getFfWeekGames(pool.season_year, week),
    getFfWeekStats(pool.season_year, week),
    getFfLineups(poolId, week),
    getFfMatchups(poolId, week),
  ])

  const scoring = resolveScoringSettings(pool)
  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))

  const starterIds = lineups
    .filter((s) => isStarterSlot(s.slot) && s.player_id)
    .map((s) => s.player_id!)
  const players = await getFfPlayersByIds(starterIds)

  const slotsByMember = new Map<string, FFLineupSlot[]>()
  for (const s of lineups) {
    const list = slotsByMember.get(s.member_id) ?? []
    list.push(s)
    slotsByMember.set(s.member_id, list)
  }

  const pointsFor = (playerId: string | null): number => {
    if (!playerId) return 0
    const stats = statsByPlayer[playerId]
    return stats ? computeFantasyPoints(stats, scoring) : 0
  }

  const starterRows = (memberId: string) =>
    sortSlots((slotsByMember.get(memberId) ?? []).filter((s) => isStarterSlot(s.slot)))

  const totalFor = (memberId: string) =>
    round2(starterRows(memberId).reduce((sum, s) => sum + pointsFor(s.player_id), 0))

  const anyGameLive = games.some((g) => g.status === 'in_progress')
  const weekFinal = games.length > 0 && games.every((g) => g.status === 'final')

  return (
    <div className="space-y-6">
      <MatchupLive anyGameLive={anyGameLive} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Week {week} Matchups</h1>
          {anyGameLive && <Badge variant="destructive">Live</Badge>}
          {weekFinal && <Badge variant="secondary">Final</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {week > 1 && (
            <Link
              href={`/pools/${poolId}/matchups/${week - 1}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              &lt; Week {week - 1}
            </Link>
          )}
          {week !== currentWeek && (
            <Link
              href={`/pools/${poolId}/matchups/${currentWeek}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Current Week
            </Link>
          )}
          {week < settings.season.regularSeasonWeeks && (
            <Link
              href={`/pools/${poolId}/matchups/${week + 1}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Week {week + 1} &gt;
            </Link>
          )}
        </div>
      </div>

      {matchups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No matchups scheduled for this week.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {matchups.map((m) => {
          const homeTotal = totalFor(m.home_member_id)
          const awayTotal = m.away_member_id ? totalFor(m.away_member_id) : null

          if (!m.away_member_id) {
            return (
              <Card key={m.id}>
                <CardContent className="py-6 text-center text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {nameByMember.get(m.home_member_id)}
                  </span>{' '}
                  has a bye this week.
                </CardContent>
              </Card>
            )
          }

          const sides = [
            { memberId: m.home_member_id, total: homeTotal },
            { memberId: m.away_member_id, total: awayTotal! },
          ]

          return (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  {sides.map((side, i) => (
                    <span
                      key={side.memberId}
                      className={cn(
                        'flex items-center gap-2',
                        i === 1 && 'flex-row-reverse text-right'
                      )}
                    >
                      <span>{nameByMember.get(side.memberId)}</span>
                      <span
                        className={cn(
                          'font-mono tabular-nums',
                          weekFinal && side.total === Math.max(homeTotal, awayTotal!) &&
                            homeTotal !== awayTotal && 'text-primary'
                        )}
                      >
                        {side.total.toFixed(2)}
                      </span>
                    </span>
                  ))}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {sides.map((side, i) => (
                    <div key={side.memberId} className="space-y-1">
                      {starterRows(side.memberId).map((s) => {
                        const p = s.player_id ? players.get(s.player_id) : null
                        return (
                          <div
                            key={s.id}
                            className={cn(
                              'flex items-baseline justify-between gap-2',
                              i === 1 && 'flex-row-reverse'
                            )}
                          >
                            <span className="min-w-0 truncate">
                              <span className="mr-1.5 text-xs font-semibold text-muted-foreground">
                                {s.slot}
                              </span>
                              {p ? p.name : <span className="text-muted-foreground">Empty</span>}
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums">
                              {pointsFor(s.player_id).toFixed(2)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
