import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import {
  getBestBallCurrentWeek,
  getBestBallWeekScores,
  getFfCurrentWeek,
  getFfRosters,
  getFfWeekGames,
  getFfWeekStats,
  getFfLineups,
  getFfMatchups,
  getFfPlayersByIds,
} from '@/lib/ff/queries'
import { resolveBestBallSettings, resolveLeagueSettings, resolveScoringSettings } from '@/lib/ff/settings'
import { computeFantasyPoints, isStarterSlot, round2 } from '@/lib/ff/scoring'
import { optimalLineup } from '@/lib/ff/bestball'
import { sortSlots } from '@/lib/ff/roster'
import { playoffRoundName, playoffRoundsCount } from '@/lib/ff/playoffs'
import { ensurePlayoffs, type PlayoffScoreProvider } from '@/lib/ff/playoff-processing'
import { isFfFamily } from '@/lib/games/registry'
import { createAdminClient } from '@/lib/supabase/admin'
import { LiveRefresh } from '@/components/live-refresh'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { FFLineupSlot, FFPosition } from '@/lib/ff/types'

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
  if (!pool || !isFfFamily(pool.game_type)) notFound()

  const bb = pool.game_type === 'ff_bestball' ? resolveBestBallSettings(pool) : null
  if (bb && bb.format !== 'h2h') notFound() // total-points pools have no matchups

  const settings = resolveLeagueSettings(pool)
  const playoffRounds = playoffRoundsCount(settings.season.playoffTeams)
  const maxWeek = Math.max(
    settings.season.regularSeasonWeeks,
    settings.season.playoffStartWeek + playoffRounds - 1
  )
  if (week > maxWeek) notFound()

  const scoring = resolveScoringSettings(pool)
  // Best ball honors site-admin test mode (simulated week)
  const { currentWeek, progressWeek } = bb
    ? await getBestBallCurrentWeek(pool.season_year, bb)
    : await getFfCurrentWeek(pool.season_year).then((w) => ({ currentWeek: w, progressWeek: w }))
  // Best ball scores come from optimal lineups — never materialize lineup rows
  const bestBallProvider: PlayoffScoreProvider | undefined = bb
    ? (p, through) => getBestBallWeekScores(p.id, p.season_year, scoring, bb, through)
    : undefined
  // Lazily generate/advance the playoff bracket (no-op during regular season)
  await ensurePlayoffs(createAdminClient(), pool, settings, progressWeek, bestBallProvider)

  const playoffRound =
    week >= settings.season.playoffStartWeek && playoffRounds > 0
      ? week - settings.season.playoffStartWeek + 1
      : null

  const [games, statsByPlayer, matchups] = await Promise.all([
    getFfWeekGames(pool.season_year, week),
    getFfWeekStats(pool.season_year, week),
    getFfMatchups(poolId, week),
  ])

  // Lineup rows: stored (ff) or synthesized from each member's optimal lineup
  // (best ball — read-only, derived from rosters)
  type LineupRow = { id: string; member_id: string; slot: FFLineupSlot['slot']; slot_index: number; player_id: string | null }
  let lineups: LineupRow[]
  if (bb) {
    const rosters = await getFfRosters(poolId)
    const rosterPlayers = await getFfPlayersByIds(rosters.map((r) => r.player_id))
    const byMember = new Map<string, Array<{ id: string; position: FFPosition }>>()
    for (const r of rosters) {
      const p = rosterPlayers.get(r.player_id)
      if (!p) continue
      const list = byMember.get(r.member_id) ?? []
      list.push({ id: p.id, position: p.position })
      byMember.set(r.member_id, list)
    }
    lineups = []
    for (const [memberId, plist] of byMember) {
      const lu = optimalLineup(plist, statsByPlayer, scoring, bb)
      for (const s of lu.slots) {
        lineups.push({
          id: `${memberId}-${s.slot}-${s.slot_index}`,
          member_id: memberId,
          slot: s.slot,
          slot_index: s.slot_index,
          player_id: s.player_id,
        })
      }
    }
  } else {
    lineups = await getFfLineups(poolId, week)
  }

  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))

  const starterIds = lineups
    .filter((s) => isStarterSlot(s.slot) && s.player_id)
    .map((s) => s.player_id!)
  const players = await getFfPlayersByIds(starterIds)

  const slotsByMember = new Map<string, LineupRow[]>()
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

  // Test mode: simulated past weeks are final and nothing is live
  const sim = bb?.test?.simulatedWeek ?? null
  const anyGameLive = sim !== null ? false : games.some((g) => g.status === 'in_progress')
  const weekFinal =
    sim !== null
      ? week < sim
      : games.length > 0 && games.every((g) => g.status === 'final')

  return (
    <div className="space-y-6">
      <LiveRefresh live={anyGameLive} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Week {week} Matchups</h1>
          {playoffRound !== null && playoffRound <= playoffRounds && (
            <Badge variant="outline">{playoffRoundName(playoffRound, playoffRounds)}</Badge>
          )}
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
          {week < maxWeek && (
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
            {playoffRound !== null
              ? 'This playoff round has not been decided yet.'
              : 'No matchups scheduled for this week.'}
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
                      <Link
                        href={`/pools/${poolId}/team?member=${side.memberId}&week=${week}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {nameByMember.get(side.memberId)}
                      </Link>
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
