import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Users, Trophy, Calendar, Settings, Shield, Share2, Flag, ArrowLeftRight, Handshake } from 'lucide-react'
import { InviteLinkButton } from '@/components/pool/invite-link'
import { getGame, isFfFamily } from '@/lib/games/registry'
import { resolveBestBallSettings } from '@/lib/ff/settings'

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
  // so its pool dashboard stays the landing page.
  if (pool.draft_status === 'completed' && pool.game_type !== 'pga' && view !== 'details') {
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
