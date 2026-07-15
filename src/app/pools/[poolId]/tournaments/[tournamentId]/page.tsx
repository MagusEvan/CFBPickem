import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getCurrentUserId } from '@/lib/pools/queries'
import { getTournament, getTournamentMembers, getTournamentGolfers } from '@/lib/pga/queries'
import {
  DeleteTournamentButton,
  RefreshFieldButton,
  TournamentDraftOrderCard,
} from '@/components/pga/tournament-admin-actions'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Users, Trophy } from 'lucide-react'
import { ensureFreshGolfers } from '@/lib/data-refresh'

export const revalidate = 60

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ poolId: string; tournamentId: string }>
}) {
  const { poolId, tournamentId } = await params
  const [pool, tournament, members, userId] = await Promise.all([
    getPool(poolId),
    getTournament(tournamentId),
    getTournamentMembers(tournamentId),
    getCurrentUserId(),
  ])

  if (!pool || !tournament) notFound()
  const isAdmin = pool.admin_id === userId

  // Staleness-gated, deduplicated field/score refresh
  await ensureFreshGolfers(tournamentId, tournament.espn_event_id)
  const golfers = await getTournamentGolfers(tournamentId)

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

      {/* Draft order (admin only, pre-draft only) */}
      {isAdmin && tournament.draft_status === 'pre_draft' && (
        <TournamentDraftOrderCard
          tournamentId={tournamentId}
          poolId={poolId}
          initialMode={tournament.draft_order_mode}
          members={members.map((m) => ({
            id: m.id,
            name: m.pool_member?.profiles?.display_name ?? '—',
            position: m.draft_position,
          }))}
        />
      )}

      {/* Golfer field */}
      <Separator />
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Field ({golfers.length} golfers)
          </h2>
          {isAdmin && tournament.espn_event_id && (
            <RefreshFieldButton tournamentId={tournamentId} poolId={poolId} />
          )}
        </div>
        {golfers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <p>No golfers loaded yet.</p>
              <p className="mt-1">
                {tournament.espn_event_id
                  ? 'ESPN typically publishes the field the week of the tournament.'
                  : 'This tournament has no ESPN event linked, so the field cannot be fetched automatically.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
              <CardContent className="overflow-x-auto py-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-2 py-2 text-left text-xs text-muted-foreground">Golfer</th>
                      <th className="px-2 py-2 text-center text-xs text-muted-foreground">DraftKings Odds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {golfers
                      .filter((g) => g.status === 'active')
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((g) => (
                        <tr key={g.id} className="border-b">
                          <td className="px-2 py-2">
                            <span className="font-medium">{g.name}</span>
                            {g.amateur && (
                              <Badge variant="outline" className="ml-1 text-[10px]">AM</Badge>
                            )}
                            {g.country && (
                              <span className="ml-1 text-xs text-muted-foreground">{g.country}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center text-xs">{g.odds_draftkings || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {golfers.some((g) => g.status !== 'active') && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {golfers.filter((g) => g.status === 'cut').length > 0 && (
                      <>{golfers.filter((g) => g.status === 'cut').length} cut</>
                    )}
                    {golfers.filter((g) => g.status === 'withdrawn').length > 0 && (
                      <> · {golfers.filter((g) => g.status === 'withdrawn').length} withdrawn</>
                    )}
                    {' '}(not shown)
                  </p>
                )}
              </CardContent>
            </Card>
        )}
      </div>

      {/* Danger zone (admin only) */}
      {isAdmin && (
        <>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Danger Zone</h2>
              <p className="text-sm text-muted-foreground">
                Permanently delete this tournament and all of its draft data.
              </p>
            </div>
            <DeleteTournamentButton
              tournamentId={tournamentId}
              poolId={poolId}
              tournamentName={tournament.name}
            />
          </div>
        </>
      )}
    </div>
  )
}
