import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Users, Trophy, Calendar, Settings, Shield, Flag, ArrowLeftRight, Handshake } from 'lucide-react'
import { InviteLinkButton } from '@/components/pool/invite-link'
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
  getFfWeekScores,
} from '@/lib/ff/queries'
import { computeStandings, type FFMatchupResult } from '@/lib/ff/standings'
import type { Pool, PoolMember, Profile } from '@/lib/types'

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

  // Once the draft is done the season is in-flight — land on standings by
  // default (?view=details reaches this page). PGA drafts are per-tournament,
  // and FF-family pools keep this page as a real hub (league nav + This Week).
  if (
    pool.draft_status === 'completed' &&
    pool.game_type !== 'pga' &&
    !isFfFamily(pool.game_type) &&
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
                    {member.profiles.display_name}
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
