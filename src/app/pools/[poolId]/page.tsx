import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Users, Trophy, Calendar, Share2 } from 'lucide-react'
import { InviteLinkButton } from '@/components/pool/invite-link'

export default async function PoolDashboard({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()

  const isAdmin = pool.admin_id === userId

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{pool.name}</h1>
          <p className="text-muted-foreground">{pool.season_year} Season</p>
        </div>
        <Badge variant={pool.draft_status === 'completed' ? 'secondary' : 'outline'}>
          {pool.draft_status === 'pre_draft' && 'Pre-Draft'}
          {pool.draft_status === 'in_progress' && 'Drafting'}
          {pool.draft_status === 'completed' && 'Season Active'}
        </Badge>
      </div>

      {/* Quick nav cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`/pools/${pool.id}/draft`}>
          <Card className="transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-3 pt-6">
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
          <Card className="transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-3 pt-6">
              <Trophy className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Standings</p>
                <p className="text-sm text-muted-foreground">Leaderboard</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/pools/${pool.id}/schedule`}>
          <Card className="transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-3 pt-6">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Schedule</p>
                <p className="text-sm text-muted-foreground">Weekly matchups</p>
              </div>
            </CardContent>
          </Card>
        </Link>

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
                  <span className="font-medium">{member.profiles.display_name}</span>
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
