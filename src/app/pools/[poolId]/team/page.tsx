import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import {
  getBestBallCurrentWeek,
  getFfCurrentWeek,
  getFfRosters,
  getFfWeekGames,
  getFfWeekStats,
  getFfLineups,
  getFfPlayersByIds,
  getNflTeamAbbrevs,
  weekGameStartByTeamId,
} from '@/lib/ff/queries'
import {
  formatStatLine,
  playerGameInfo,
  weekGamesByTeamId,
  type PlayerGameInfo,
} from '@/lib/ff/stat-format'
import { resolveBestBallSettings, resolveLeagueSettings, resolveScoringSettings } from '@/lib/ff/settings'
import { computeFantasyPoints, scoreLineup } from '@/lib/ff/scoring'
import { optimalLineup } from '@/lib/ff/bestball'
import { isPlayerLocked, sortSlots } from '@/lib/ff/roster'
import { isFfFamily } from '@/lib/games/registry'
import { LineupEditor } from '@/components/ff/lineup-editor'
import { BestBallTeam } from '@/components/ff/bestball-team'
import { WeekSelector } from '@/components/ff/week-selector'
import { LiveRefresh } from '@/components/live-refresh'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { FFStatLine } from '@/lib/ff/types'

export const revalidate = 30

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>
  searchParams: Promise<{ week?: string; member?: string }>
}) {
  const { poolId } = await params
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool || !isFfFamily(pool.game_type)) notFound()
  const myMember = members.find((m) => m.user_id === userId)
  if (!myMember) notFound()

  if (pool.draft_status !== 'completed') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">My Team</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Your team will appear here after the draft.
          </CardContent>
        </Card>
      </div>
    )
  }

  // Best ball: read-only optimal-lineup view — no lineup rows ever written
  if (pool.game_type === 'ff_bestball') {
    const bb = resolveBestBallSettings(pool)
    const scoring = resolveScoringSettings(pool)
    const { currentWeek } = await getBestBallCurrentWeek(pool.season_year, bb)
    const sp = await searchParams

    const viewMember =
      (sp.member && members.find((m) => m.id === sp.member)) || myMember
    const requestedWeek = Number(sp.week)
    const week = Number.isInteger(requestedWeek)
      ? Math.min(Math.max(requestedWeek, 1), currentWeek)
      : currentWeek

    const rosters = await getFfRosters(poolId)
    const memberRoster = rosters.filter((r) => r.member_id === viewMember.id)
    const [players, statsByPlayer, games, abbrevByTeamId] = await Promise.all([
      getFfPlayersByIds(memberRoster.map((r) => r.player_id)),
      getFfWeekStats(pool.season_year, week),
      getFfWeekGames(pool.season_year, week),
      getNflTeamAbbrevs(),
    ])

    const lineup = optimalLineup(
      memberRoster
        .map((r) => players.get(r.player_id))
        .filter((p): p is NonNullable<typeof p> => p != null)
        .map((p) => ({ id: p.id, position: p.position })),
      statsByPlayer,
      scoring,
      bb
    )

    const gamesByTeam = weekGamesByTeamId(games)
    const statLineByPlayer: Record<string, string> = {}
    const gameInfoByPlayer: Record<string, PlayerGameInfo> = {}
    for (const p of players.values()) {
      const stats = statsByPlayer[p.id]
      if (stats) statLineByPlayer[p.id] = formatStatLine(stats, p.position)
      const info = playerGameInfo(p.nfl_team_id, gamesByTeam, abbrevByTeamId)
      if (info) gameInfoByPlayer[p.id] = info
    }

    return (
      <BestBallTeam
        poolId={poolId}
        week={week}
        currentWeek={currentWeek}
        memberName={viewMember.profiles.display_name}
        memberId={viewMember.id}
        isMyTeam={viewMember.id === myMember.id}
        lineup={lineup}
        playersById={Object.fromEntries(players)}
        statLineByPlayer={statLineByPlayer}
        gameInfoByPlayer={gameInfoByPlayer}
      />
    )
  }

  // ?member= views any manager's roster (read-only); ?week= views past weeks
  const sp = await searchParams
  const currentWeek = await getFfCurrentWeek(pool.season_year)
  const viewMember = (sp.member && members.find((m) => m.id === sp.member)) || myMember
  const isMyTeam = viewMember.id === myMember.id
  const requestedWeek = Number(sp.week)
  const week = Number.isInteger(requestedWeek)
    ? Math.min(Math.max(requestedWeek, 1), currentWeek)
    : currentWeek

  const [games, statsByPlayer, lineups] = await Promise.all([
    getFfWeekGames(pool.season_year, week),
    getFfWeekStats(pool.season_year, week),
    getFfLineups(poolId, week),
  ])

  const slots = sortSlots(lineups.filter((s) => s.member_id === viewMember.id))
  const playerIds = slots.map((s) => s.player_id).filter((id): id is string => id !== null)
  const players = await getFfPlayersByIds(playerIds)

  const scoring = resolveScoringSettings(pool)
  const settings = resolveLeagueSettings(pool)
  const startByTeam = weekGameStartByTeamId(games)

  const abbrevByTeamId = await getNflTeamAbbrevs()
  const gamesByTeam = weekGamesByTeamId(games)

  const pointsByPlayer: Record<string, number> = {}
  const statLineByPlayer: Record<string, string> = {}
  const gameInfoByPlayer: Record<string, PlayerGameInfo> = {}
  for (const id of playerIds) {
    const stats = statsByPlayer[id] as FFStatLine | undefined
    pointsByPlayer[id] = stats ? computeFantasyPoints(stats, scoring) : 0
    const p = players.get(id)
    if (p && stats) statLineByPlayer[id] = formatStatLine(stats, p.position)
    const info = p ? playerGameInfo(p.nfl_team_id, gamesByTeam, abbrevByTeamId) : null
    if (info) gameInfoByPlayer[id] = info
  }
  const lockedPlayerIds = playerIds.filter((id) => {
    const p = players.get(id)
    return p ? isPlayerLocked(p, startByTeam) : false
  })

  const total = scoreLineup(slots, statsByPlayer, scoring)
  const anyGameLive = week === currentWeek && games.some((g) => g.status === 'in_progress')
  const canEdit = isMyTeam && week === currentWeek

  return (
    <div className="space-y-6">
      <LiveRefresh live={anyGameLive} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isMyTeam ? 'My Team' : `${viewMember.profiles.display_name}'s Team`}
          </h1>
          <p className="text-sm text-muted-foreground">
            Week {week} · {total.toFixed(2)} pts
          </p>
        </div>
        <div className="flex gap-2">
          {!isMyTeam && (
            <Link href={`/pools/${poolId}/team`} className={buttonVariants({ variant: 'outline' })}>
              My Team
            </Link>
          )}
          <Link
            href={`/pools/${poolId}/matchups/${week}`}
            className={buttonVariants({ variant: 'outline' })}
          >
            View Matchups
          </Link>
        </div>
      </div>

      <WeekSelector
        weeks={currentWeek}
        selected={week}
        hrefFor={(w) =>
          `/pools/${poolId}/team?week=${w}${isMyTeam ? '' : `&member=${viewMember.id}`}`
        }
      />

      <div className="max-w-2xl">
        <LineupEditor
          poolId={poolId}
          slots={slots}
          playersById={Object.fromEntries(players)}
          pointsByPlayer={pointsByPlayer}
          lockedPlayerIds={lockedPlayerIds}
          settings={settings}
          canEdit={canEdit}
          statLineByPlayer={statLineByPlayer}
          gameInfoByPlayer={gameInfoByPlayer}
        />
      </div>
    </div>
  )
}
