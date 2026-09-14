import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Users, Trophy, Calendar, Settings, Shield, Flag, ArrowLeftRight, Handshake } from 'lucide-react'
import { InviteLinkButton } from '@/components/pool/invite-link'
import { OnlineDot } from '@/components/online-dot'
import { LiveRefresh } from '@/components/live-refresh'
import { PlayerGameContext } from '@/components/ff/player-game-context'
import { getGame, isFfFamily } from '@/lib/games/registry'
import {
  resolveBestBallSettings,
  resolveLeagueSettings,
  resolveScoringSettings,
} from '@/lib/ff/settings'
import {
  getBestBallCurrentWeek,
  getBestBallWeekScores,
  getFfCurrentWeek,
  getFfLineups,
  getFfMatchups,
  getFfRosters,
  getFfWeekGames,
  getFfWeekStats,
  getFfWeekScores,
  getFfPlayersByIds,
  getNflTeamAbbrevs,
} from '@/lib/ff/queries'
import { computeFantasyPoints, scoreLineup, isStarterSlot } from '@/lib/ff/scoring'
import { optimalLineup } from '@/lib/ff/bestball'
import { sortSlots } from '@/lib/ff/roster'
import {
  formatStatLine,
  playerGameInfo,
  weekGamesByTeamId,
  type PlayerGameInfo,
} from '@/lib/ff/stat-format'
import { computeStandings, type FFMatchupResult } from '@/lib/ff/standings'
import type { Pool, PoolMember, Profile } from '@/lib/types'
import type { FFStatLine } from '@/lib/ff/types'
import { cn } from '@/lib/utils'

export const revalidate = 60

export default async function PoolDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { poolId } = await params
  const { view } = await searchParams
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()

  const supabase = await createClient()
  const { data: championship } = await supabase
    .from('pool_championships')
    .select('pool_id')
    .eq('pool_id', poolId)
    .maybeSingle()
  const isFinalized = championship !== null

  // PGA pools redirect to standings after draft since they don't have
  // a persistent home page. CFB/WC/FF pools now have tabbed navigation
  // so the home page is always a valid destination.
  if (
    pool.draft_status === 'completed' &&
    pool.game_type === 'pga' &&
    view !== 'details'
  ) {
    redirect(`/pools/${poolId}/standings`)
  }

  const isAdmin = pool.admin_id === userId
  const myMember = members.find((m) => m.user_id === userId)
  const isBestBall = pool.game_type === 'ff_bestball'
  const showMatchups = !isBestBall || resolveBestBallSettings(pool).format === 'h2h'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{pool.name}</h1>
          <p className="text-muted-foreground">
            {getGame(pool.game_type).poolLabel(pool.season_year)}
          </p>
        </div>
        <Badge variant={pool.draft_status === 'completed' ? 'secondary' : 'outline'}>
          {isFinalized
            ? 'Completed'
            : pool.draft_status === 'pre_draft'
              ? 'Pre-Draft'
              : pool.draft_status === 'in_progress'
                ? 'Drafting'
                : 'Season Active'}
        </Badge>
      </div>

      {isFfFamily(pool.game_type) && pool.draft_status === 'completed' && myMember && !isFinalized && (
        <ThisWeekCard pool={pool} members={members} myMember={myMember} />
      )}

      {/* Quick nav cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isFfFamily(pool.game_type) ? (
          <>
            <Link href={`/pools/${pool.id}/draft`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Draft</p>
                    <p className="text-sm text-muted-foreground">
                      {pool.draft_status === 'pre_draft' ? 'Not started' :
                       pool.draft_status === 'in_progress' ? 'In progress' : 'View results'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {pool.draft_status === 'completed' && (
              <>
                <Link href={`/pools/${pool.id}/team`}>
                  <Card className="py-0 transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center gap-3 px-4 py-4">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">My Team</p>
                        <p className="text-sm text-muted-foreground">
                          {isBestBall ? 'Weekly optimal lineup' : 'Set your lineup'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {showMatchups && (
                  <Link href={`/pools/${pool.id}/matchups`}>
                    <Card className="py-0 transition-colors hover:bg-muted/50">
                      <CardContent className="flex items-center gap-3 px-4 py-4">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Matchups</p>
                          <p className="text-sm text-muted-foreground">Weekly head-to-head</p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )}

                <Link href={`/pools/${pool.id}/standings`}>
                  <Card className="py-0 transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center gap-3 px-4 py-4">
                      <Trophy className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Standings</p>
                        <p className="text-sm text-muted-foreground">
                          {showMatchups ? 'Records & playoff race' : 'Points leaderboard'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {!isBestBall && (
                  <>
                    <Link href={`/pools/${pool.id}/transactions`}>
                      <Card className="py-0 transition-colors hover:bg-muted/50">
                        <CardContent className="flex items-center gap-3 px-4 py-4">
                          <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Transactions</p>
                            <p className="text-sm text-muted-foreground">Adds, drops & waivers</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>

                    <Link href={`/pools/${pool.id}/trades`}>
                      <Card className="py-0 transition-colors hover:bg-muted/50">
                        <CardContent className="flex items-center gap-3 px-4 py-4">
                          <Handshake className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Trades</p>
                            <p className="text-sm text-muted-foreground">Propose & review deals</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </>
                )}
              </>
            )}

            <Link href={`/pools/${pool.id}/players`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Players</p>
                    <p className="text-sm text-muted-foreground">NFL player pool</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/pools/${pool.id}/settings`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Settings</p>
                    <p className="text-sm text-muted-foreground">
                      {isAdmin ? 'Manage league' : 'View settings'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </>
        ) : pool.game_type === 'pga' ? (
          <>
            <Link href={`/pools/${pool.id}/tournaments`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Flag className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Tournaments</p>
                    <p className="text-sm text-muted-foreground">View events & drafts</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/pools/${pool.id}/settings`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Settings</p>
                    <p className="text-sm text-muted-foreground">
                      {isAdmin ? 'Manage league' : 'View settings'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </>
        ) : (
          <>
            <Link href={`/pools/${pool.id}/draft`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Draft</p>
                    <p className="text-sm text-muted-foreground">
                      {pool.draft_status === 'pre_draft' ? 'Not started' :
                       pool.draft_status === 'in_progress' ? 'In progress' : 'View results'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/pools/${pool.id}/standings`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Trophy className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Standings</p>
                    <p className="text-sm text-muted-foreground">Leaderboard</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/pools/${pool.id}/schedule`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Schedule</p>
                    <p className="text-sm text-muted-foreground">
                      {getGame(pool.game_type).scheduleDescription}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/pools/${pool.id}/settings`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 px-4 py-4">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Settings</p>
                    <p className="text-sm text-muted-foreground">
                      {isAdmin ? 'Manage pool' : 'View settings'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {pool.draft_status === 'completed' && myMember && (
              <Link href={`/pools/${pool.id}/rosters/${myMember.id}`}>
                <Card className="py-0 transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 px-4 py-4">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">My Squad</p>
                      <p className="text-sm text-muted-foreground">View your roster</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
          </>
        )}

        {isAdmin && pool.draft_status === 'pre_draft' && (
          <InviteLinkButton inviteCode={pool.invite_code} />
        )}
      </div>

      <Separator />

      {/* Members list */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          Managers ({members.length}/{pool.max_managers})
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  {member.draft_position && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {member.draft_position}
                    </span>
                  )}
                  <Link href={`/profile/${member.user_id}`} className="font-medium hover:underline">
                    {member.profiles.display_name}<OnlineDot lastActiveAt={member.profiles.last_active_at} />
                  </Link>
                </div>
                {member.user_id === pool.admin_id && (
                  <Badge variant="outline" className="text-xs">Admin</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {isFfFamily(pool.game_type) && pool.draft_status === 'completed' && !isFinalized && (
        <LeagueRosters pool={pool} members={members} />
      )}

      {/* Admin actions */}
      {isAdmin && pool.draft_status === 'pre_draft' && (
        <>
          <Separator />
          <div className="flex gap-4">
            <Link href={`/pools/${pool.id}/settings`} className={buttonVariants({ variant: 'outline' })}>
              Pool Settings
            </Link>
            {members.length >= 2 && (
              <Link href={`/pools/${pool.id}/draft`} className={buttonVariants()}>
                Start Draft
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const ordinal = (n: number) =>
  `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4)] ?? 'th'}`

/**
 * In-season snapshot for the FF hub: this week's matchup (h2h) or week score
 * (best ball total), plus the member's record/rank. Mirrors the standings
 * page's score derivation so both surfaces agree.
 */
async function ThisWeekCard({
  pool,
  members,
  myMember,
}: {
  pool: Pool
  members: (PoolMember & { profiles: Profile })[]
  myMember: PoolMember & { profiles: Profile }
}) {
  const settings = resolveLeagueSettings(pool)
  const scoring = resolveScoringSettings(pool)
  const bb = pool.game_type === 'ff_bestball' ? resolveBestBallSettings(pool) : null

  const { currentWeek } = bb
    ? await getBestBallCurrentWeek(pool.season_year, bb)
    : { currentWeek: await getFfCurrentWeek(pool.season_year) }
  const throughWeek = Math.min(currentWeek, settings.season.regularSeasonWeeks)

  // Current-week lineups may not be materialized yet if nobody visited a
  // score page this week (best ball derives from rosters — nothing to do)
  if (!bb) await getFfLineups(pool.id, currentWeek)

  const weekScores = bb
    ? await getBestBallWeekScores(pool.id, pool.season_year, scoring, bb, currentWeek)
    : await getFfWeekScores(pool.id, pool.season_year, scoring, currentWeek)
  const thisWeek = weekScores.find((ws) => ws.week === currentWeek)
  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))
  const myScore = thisWeek?.scoreByMember.get(myMember.id) ?? 0

  // Best ball total: no matchups — week score, season total, rank
  if (bb && bb.format === 'total') {
    const totals = new Map<string, number>()
    for (const ws of weekScores) {
      if (ws.week > throughWeek) continue
      for (const [memberId, score] of ws.scoreByMember) {
        totals.set(memberId, (totals.get(memberId) ?? 0) + score)
      }
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const myRank = sorted.findIndex(([id]) => id === myMember.id) + 1

    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Week {currentWeek}</p>
            <p className="text-lg font-semibold">
              {myScore.toFixed(2)} pts this week
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Season</p>
            <p className="text-lg font-semibold">
              {(totals.get(myMember.id) ?? 0).toFixed(2)} pts
              {myRank > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {ordinal(myRank)} of {sorted.length}
                </span>
              )}
            </p>
          </div>
          <Link href={`/pools/${pool.id}/standings`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Leaderboard
          </Link>
        </CardContent>
      </Card>
    )
  }

  // H2H (ff or best ball h2h): my matchup + record
  const matchups = await getFfMatchups(pool.id)
  const myMatchup = matchups.find(
    (m) =>
      m.week === currentWeek &&
      (m.home_member_id === myMember.id || m.away_member_id === myMember.id)
  )

  const scoresByWeek = new Map(weekScores.map((ws) => [ws.week, ws]))
  const results: FFMatchupResult[] = matchups
    .filter((m) => !m.is_playoff && m.week <= throughWeek)
    .map((m) => {
      const ws = scoresByWeek.get(m.week)
      return {
        week: m.week,
        homeMemberId: m.home_member_id,
        awayMemberId: m.away_member_id,
        homeScore: ws?.scoreByMember.get(m.home_member_id) ?? 0,
        awayScore: m.away_member_id ? ws?.scoreByMember.get(m.away_member_id) ?? 0 : 0,
        final: ws?.final ?? false,
      }
    })
  const standings = computeStandings(members.map((m) => m.id), results)
  const mine = standings.find((s) => s.memberId === myMember.id)
  const myPlace = standings.findIndex((s) => s.memberId === myMember.id) + 1

  const isBye = myMatchup ? myMatchup.away_member_id === null : false
  const opponentId = myMatchup
    ? myMatchup.home_member_id === myMember.id
      ? myMatchup.away_member_id
      : myMatchup.home_member_id
    : null
  const opponentScore = opponentId ? thisWeek?.scoreByMember.get(opponentId) ?? 0 : 0

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Week {currentWeek}
            {myMatchup?.is_playoff && ' · Playoffs'}
          </p>
          {!myMatchup ? (
            <p className="text-lg font-semibold">No matchup this week</p>
          ) : isBye ? (
            <p className="text-lg font-semibold">You have a bye this week</p>
          ) : (
            <p className="text-lg font-semibold">
              You {myScore.toFixed(2)}{' '}
              <span className="font-normal text-muted-foreground">vs</span>{' '}
              {opponentId ? nameByMember.get(opponentId) ?? '—' : '—'} {opponentScore.toFixed(2)}
            </p>
          )}
        </div>
        {mine && (
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Record</p>
            <p className="text-lg font-semibold">
              {mine.wins}-{mine.losses}
              {mine.ties > 0 && `-${mine.ties}`}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {ordinal(myPlace)} of {standings.length}
              </span>
            </p>
          </div>
        )}
        <Link
          href={`/pools/${pool.id}/matchups/${currentWeek}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          View Matchups
        </Link>
      </CardContent>
    </Card>
  )
}

/**
 * All teams and rosters on one page. Players are styled by game status:
 * greyed out if final, highlighted if in_progress, normal if scheduled.
 */
async function LeagueRosters({
  pool,
  members,
}: {
  pool: Pool
  members: (PoolMember & { profiles: Profile })[]
}) {
  const isBestBall = pool.game_type === 'ff_bestball'
  const bb = isBestBall ? resolveBestBallSettings(pool) : null
  const scoring = resolveScoringSettings(pool)
  const settings = isBestBall ? null : resolveLeagueSettings(pool)

  const currentWeek = bb
    ? (await getBestBallCurrentWeek(pool.season_year, bb)).currentWeek
    : await getFfCurrentWeek(pool.season_year)

  const [rosters, games, statsByPlayer, abbrevByTeamId] = await Promise.all([
    getFfRosters(pool.id),
    getFfWeekGames(pool.season_year, currentWeek),
    getFfWeekStats(pool.season_year, currentWeek),
    getNflTeamAbbrevs(),
  ])

  // For H2H, also fetch lineups to show starters vs bench
  const lineups = !isBestBall
    ? await getFfLineups(pool.id, currentWeek)
    : null

  const allPlayerIds = [...new Set(rosters.map((r) => r.player_id))]
  const playersById = await getFfPlayersByIds(allPlayerIds)

  const gamesByTeam = weekGamesByTeamId(games)
  const anyLive = games.some((g) => g.status === 'in_progress')

  // Build game info + points per player
  const gameInfoByPlayer: Record<string, PlayerGameInfo> = {}
  const pointsByPlayer: Record<string, number> = {}
  const statLineByPlayer: Record<string, string> = {}
  for (const p of playersById.values()) {
    const info = playerGameInfo(p.nfl_team_id, gamesByTeam, abbrevByTeamId)
    if (info) gameInfoByPlayer[p.id] = info
    const stats = statsByPlayer[p.id] as FFStatLine | undefined
    pointsByPlayer[p.id] = stats ? computeFantasyPoints(stats, scoring) : 0
    if (stats) statLineByPlayer[p.id] = formatStatLine(stats, p.position)
  }

  // Group rosters by member
  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))

  // Build per-member team data
  type TeamPlayer = {
    id: string
    name: string
    position: string
    team: string
    headshot: string | null
    points: number
    statLine: string | null
    gameInfo: PlayerGameInfo | null
    isStarter: boolean
  }

  const teams: Array<{ memberId: string; name: string; total: number; players: TeamPlayer[] }> = []

  for (const member of members) {
    const memberRoster = rosters.filter((r) => r.member_id === member.id)
    const memberLineup = lineups?.filter((s) => s.member_id === member.id) ?? []

    // Determine which players are starters and compute total
    let starterPlayerIds: Set<string>
    let total: number

    if (lineups) {
      // H2H: starters come from lineup slots
      starterPlayerIds = new Set(
        memberLineup.filter((s) => isStarterSlot(s.slot) && s.player_id).map((s) => s.player_id!)
      )
      total = scoreLineup(sortSlots(memberLineup), statsByPlayer, scoring)
    } else {
      // Best ball: starters come from optimal lineup calculation
      const rosterPlayers = memberRoster
        .map((r) => playersById.get(r.player_id))
        .filter((p): p is NonNullable<typeof p> => p != null)
        .map((p) => ({ id: p.id, position: p.position }))
      const optimal = optimalLineup(rosterPlayers, statsByPlayer, scoring, bb!)
      starterPlayerIds = optimal.starterIds
      total = optimal.total
    }

    const players: TeamPlayer[] = []
    for (const r of memberRoster) {
      const p = playersById.get(r.player_id)
      if (!p) continue
      players.push({
        id: p.id,
        name: p.name,
        position: p.position,
        team: p.nfl_team_abbrev ?? 'FA',
        headshot: p.headshot_url,
        points: pointsByPlayer[p.id] ?? 0,
        statLine: statLineByPlayer[p.id] ?? null,
        gameInfo: gameInfoByPlayer[p.id] ?? null,
        isStarter: starterPlayerIds.has(p.id),
      })
    }

    // Sort: starters first, then by position priority, then by points
    const posPriority: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DST: 6 }
    players.sort((a, b) => {
      if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1
      const pa = posPriority[a.position] ?? 99
      const pb = posPriority[b.position] ?? 99
      if (pa !== pb) return pa - pb
      return b.points - a.points
    })

    teams.push({ memberId: member.id, name: member.profiles.display_name, total, players })
  }

  // Sort teams by total points descending
  teams.sort((a, b) => b.total - a.total)

  return (
    <>
      <LiveRefresh live={anyLive} />
      <Separator />
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          League Rosters — Week {currentWeek}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((team) => (
            <Card key={team.memberId}>
              <CardContent className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <Link
                    href={`/pools/${pool.id}/team?member=${team.memberId}`}
                    className="font-semibold hover:underline"
                  >
                    {team.name}
                  </Link>
                  <span className="font-mono text-sm tabular-nums">
                    {team.total.toFixed(2)} pts
                  </span>
                </div>
                <div className="space-y-0.5">
                  {team.players.map((p, i) => {
                    const status = p.gameInfo?.status ?? 'scheduled'
                    const showBenchLabel = lineups && i > 0 && p.isStarter === false && team.players[i - 1]?.isStarter === true

                    return (
                      <div key={p.id}>
                        {showBenchLabel && (
                          <div className="mb-0.5 mt-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                            Bench
                          </div>
                        )}
                        <div
                          className={cn(
                            'flex items-center gap-2 rounded px-2 py-1 text-sm',
                            status === 'final' && 'text-muted-foreground/60',
                            status === 'in_progress' && 'bg-primary/5',
                          )}
                        >
                          {p.headshot ? (
                            <Image
                              src={p.headshot}
                              alt={p.name}
                              width={24}
                              height={24}
                              className={cn(
                                'h-6 w-6 rounded-full object-cover',
                                status === 'final' && 'opacity-50',
                              )}
                            />
                          ) : (
                            <span className="h-6 w-6" />
                          )}
                          <span className="w-8 shrink-0 text-xs font-medium">
                            {p.position}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className={cn('font-medium', status === 'final' && 'font-normal')}>
                              {p.name}
                            </span>
                            <span className={cn(
                              'ml-1 text-xs',
                              status === 'final' ? 'text-muted-foreground/50' : 'text-muted-foreground',
                            )}>
                              {p.team}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {p.statLine ? (
                              <span className="hidden sm:inline">{p.statLine}</span>
                            ) : p.gameInfo ? (
                              <PlayerGameContext info={p.gameInfo} />
                            ) : null}
                          </span>
                          <span className={cn(
                            'w-14 shrink-0 text-right font-mono text-xs tabular-nums',
                            status === 'in_progress' && 'font-semibold text-foreground',
                          )}>
                            {p.points.toFixed(2)}
                            {p.isStarter && (
                              <span className="ml-0.5 text-[9px] text-yellow-500">&#9733;</span>
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
