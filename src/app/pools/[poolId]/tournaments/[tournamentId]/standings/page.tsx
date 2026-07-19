import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool } from '@/lib/pools/queries'
import { getTournament, getTournamentMembers, getTournamentGolfers, getTournamentPicks } from '@/lib/pga/queries'
import { calculatePgaStandings, golfersInPlay } from '@/lib/pga/scoring'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { PgaLeaderboard } from '@/components/pga/pga-leaderboard'
import { ensureFreshGolfers } from '@/lib/data-refresh'
import { LiveRefresh } from '@/components/live-refresh'
import { GameTime } from '@/components/schedule/game-time'

export const revalidate = 60

export default async function PgaStandingsPage({
  params,
}: {
  params: Promise<{ poolId: string; tournamentId: string }>
}) {
  const { poolId, tournamentId } = await params
  const [pool, tournament, members, picks] = await Promise.all([
    getPool(poolId),
    getTournament(tournamentId),
    getTournamentMembers(tournamentId),
    getTournamentPicks(tournamentId),
  ])

  if (!pool || !tournament) notFound()

  // Staleness-gated, deduplicated score refresh
  await ensureFreshGolfers(tournamentId, tournament.espn_event_id)
  const golfers = await getTournamentGolfers(tournamentId)
  const standings = calculatePgaStandings(
    members, picks, golfers, tournament.top_n_scoring,
    tournament.course_par, tournament.missed_cut_score
  )

  // Poll for updates while golfers are on the course
  const live = golfersInPlay(golfers)

  // Find the latest fetched_at for display
  const lastFetched = golfers.length > 0
    ? golfers.reduce((latest, g) => (g.fetched_at > latest ? g.fetched_at : latest), golfers[0].fetched_at)
    : null

  return (
    <div className="space-y-6">
      <LiveRefresh live={live} />
      <div className="flex items-center gap-4">
        <Link
          href={`/pools/${poolId}/tournaments/${tournamentId}?view=details`}
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
      </div>

      {lastFetched && (
        <p className="text-xs text-muted-foreground">
          Scores last updated: <GameTime startTime={lastFetched} />
        </p>
      )}

      {standings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No standings data available yet.
          </CardContent>
        </Card>
      ) : (
        <PgaLeaderboard
          standings={standings}
          topN={tournament.top_n_scoring}
          coursePar={tournament.course_par}
          missedCutScore={tournament.missed_cut_score}
          countingHighlightColor={pool.counting_highlight_color ?? '#e6f4e6'}
        />
      )}
    </div>
  )
}
