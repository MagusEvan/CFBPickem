import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getCurrentUserId } from '@/lib/pools/queries'
import { getTournament, getTournamentMembers, getTournamentGolfers, getTournamentPicks } from '@/lib/pga/queries'
import { calculatePgaStandings } from '@/lib/pga/scoring'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { PgaLeaderboard } from '@/components/pga/pga-leaderboard'
import { RefreshGolfersButton } from '@/components/pga/refresh-golfers-button'

export const revalidate = 60

export default async function PgaStandingsPage({
  params,
}: {
  params: Promise<{ poolId: string; tournamentId: string }>
}) {
  const { poolId, tournamentId } = await params
  const [pool, tournament, members, golfers, picks, userId] = await Promise.all([
    getPool(poolId),
    getTournament(tournamentId),
    getTournamentMembers(tournamentId),
    getTournamentGolfers(tournamentId),
    getTournamentPicks(tournamentId),
    getCurrentUserId(),
  ])

  if (!pool || !tournament) notFound()

  const isAdmin = pool.admin_id === userId
  const standings = calculatePgaStandings(
    members, picks, golfers, tournament.top_n_scoring,
    tournament.course_par, tournament.missed_cut_score
  )

  // Find the latest fetched_at for display
  const lastFetched = golfers.length > 0
    ? golfers.reduce((latest, g) => (g.fetched_at > latest ? g.fetched_at : latest), golfers[0].fetched_at)
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/pools/${poolId}/tournaments/${tournamentId}`}
          className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Tournament
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-sm text-muted-foreground">
            Leaderboard · Top {tournament.top_n_scoring} of {tournament.golfers_per_manager} scores per round
          </p>
        </div>
        {isAdmin && tournament.espn_event_id && (
          <RefreshGolfersButton tournamentId={tournamentId} />
        )}
      </div>

      {lastFetched && (
        <p className="text-xs text-muted-foreground">
          Scores last updated: {new Date(lastFetched).toLocaleString()}
        </p>
      )}

      {standings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No standings data available yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4">
            <PgaLeaderboard
              standings={standings}
              topN={tournament.top_n_scoring}
              coursePar={tournament.course_par}
              missedCutScore={tournament.missed_cut_score}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
