import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool } from '@/lib/pools/queries'
import { getTournament, getTournamentMembers, getTournamentGolfers, getTournamentPicks, getCalcuttaLots } from '@/lib/pga/queries'
import { calculatePgaStandings, golfersInPlay, computeFieldPositions, formatScoreToPar } from '@/lib/pga/scoring'
import { computeCalcuttaPayouts, buildLedger } from '@/lib/calcutta/engine'
import { DEFAULT_CALCUTTA_SETTINGS } from '@/lib/pga/calcutta-types'
import { CalcuttaLedger, type LedgerManagerRow } from '@/components/pga/calcutta-ledger'
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
  const isCalcutta = tournament.draft_type === 'calcutta'
  const standings = isCalcutta ? [] : calculatePgaStandings(
    members, picks, golfers, tournament.top_n_scoring,
    tournament.course_par, tournament.missed_cut_score
  )

  // Calcutta: money ledger from lot prices + pot payouts by finish position
  let calcuttaPot = 0
  let calcuttaRows: LedgerManagerRow[] = []
  if (isCalcutta) {
    const lots = await getCalcuttaLots(tournamentId)
    const settings = tournament.calcutta_settings ?? DEFAULT_CALCUTTA_SETTINGS
    const soldLots = lots.filter((l) => l.status === 'sold' && l.winner_member_id && l.price !== null)
    calcuttaPot = soldLots.reduce((s, l) => s + (l.price ?? 0), 0)

    const positions = computeFieldPositions(golfers)
    const finishers = golfers
      .filter((g) => positions.has(g.id))
      .map((g) => {
        const p = positions.get(g.id)!
        return { itemId: g.id, position: p.position, tiedCount: p.tiedCount }
      })
    const payouts = computeCalcuttaPayouts(calcuttaPot, settings.payoutTiers, finishers)
    const ledger = buildLedger(
      soldLots.map((l) => ({ winnerId: l.winner_member_id!, price: l.price!, itemIds: l.golfer_ids })),
      payouts
    )

    const golferById = new Map(golfers.map((g) => [g.id, g]))
    calcuttaRows = members
      .map((m) => {
        const row = ledger.get(m.id)
        const myLots = soldLots.filter((l) => l.winner_member_id === m.id)
        return {
          memberId: m.id,
          name: m.pool_member?.profiles?.display_name ?? '—',
          spent: row?.spent ?? 0,
          won: row?.won ?? 0,
          net: row?.net ?? 0,
          golfers: myLots.flatMap((lot) =>
            lot.golfer_ids.map((gid, i) => {
              const g = golferById.get(gid)
              const pos = positions.get(gid)
              return {
                name: g?.name ?? 'Unknown',
                finishLabel: pos ? pos.label : '—',
                scoreLabel: g ? formatScoreToPar(g.total_score) : '—',
                payout: payouts.get(gid) ?? 0,
                lotLabel: lot.label,
                lotPrice: i === 0 ? lot.price : null,
              }
            })
          ),
        }
      })
      .sort((a, b) => b.net - a.net)
  }

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
            {isCalcutta
              ? 'Calcutta ledger · Pot payouts by finish position'
              : `Leaderboard · Top ${tournament.top_n_scoring} of ${tournament.golfers_per_manager} scores per round`}
          </p>
        </div>
      </div>

      {lastFetched && (
        <p className="text-xs text-muted-foreground">
          Scores last updated: <GameTime startTime={lastFetched} />
        </p>
      )}

      {isCalcutta ? (
        <CalcuttaLedger pot={calcuttaPot} rows={calcuttaRows} />
      ) : standings.length === 0 ? (
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
