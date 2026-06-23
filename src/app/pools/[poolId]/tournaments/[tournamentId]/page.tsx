import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getCurrentUserId } from '@/lib/pools/queries'
import { getTournament, getTournamentMembers, getTournamentGolfers } from '@/lib/pga/queries'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Users, Trophy } from 'lucide-react'
import { RefreshGolfersButton } from '@/components/pga/refresh-golfers-button'

export const revalidate = 60

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ poolId: string; tournamentId: string }>
}) {
  const { poolId, tournamentId } = await params
  const [pool, tournament, members, golfers, userId] = await Promise.all([
    getPool(poolId),
    getTournament(tournamentId),
    getTournamentMembers(tournamentId),
    getTournamentGolfers(tournamentId),
    getCurrentUserId(),
  ])

  if (!pool || !tournament) notFound()

  const isAdmin = pool.admin_id === userId

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/pools/${poolId}/tournaments`}
          className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Tournaments
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground">
            {tournament.start_date
              ? new Date(tournament.start_date + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
              : `${tournament.season_year}`}
            {' · '}{tournament.golfers_per_manager} golfers/mgr · Top {tournament.top_n_scoring}
          </p>
        </div>
        <Badge variant={tournament.draft_status === 'completed' ? 'secondary' : 'outline'}>
          {tournament.draft_status === 'pre_draft' && 'Pre-Draft'}
          {tournament.draft_status === 'in_progress' && 'Drafting'}
          {tournament.draft_status === 'completed' && 'Active'}
        </Badge>
      </div>

      {/* Nav cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href={`/pools/${poolId}/tournaments/${tournamentId}/draft`}>
          <Card className="py-0 transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-3 px-4 py-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Draft</p>
                <p className="text-sm text-muted-foreground">
                  {tournament.draft_status === 'pre_draft' ? 'Not started' :
                   tournament.draft_status === 'in_progress' ? 'In progress' : 'View results'}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {tournament.draft_status === 'completed' && (
          <Link href={`/pools/${poolId}/tournaments/${tournamentId}/standings`}>
            <Card className="py-0 transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-3 px-4 py-4">
                <Trophy className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Leaderboard</p>
                  <p className="text-sm text-muted-foreground">Scores & standings</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      <Separator />

      {/* Participants */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Participants ({members.length})
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  {m.draft_position && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {m.draft_position}
                    </span>
                  )}
                  <span className="font-medium">{m.pool_member?.profiles?.display_name}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Golfer field info */}
      {golfers.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Field ({golfers.length} golfers)
              </h2>
              {isAdmin && tournament.espn_event_id && (
                <RefreshGolfersButton tournamentId={tournamentId} />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {golfers.filter((g) => g.status === 'active').length} active
              {golfers.some((g) => g.status === 'cut') && (
                <> · {golfers.filter((g) => g.status === 'cut').length} cut</>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
