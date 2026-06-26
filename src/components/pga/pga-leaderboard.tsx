'use client'

import type { ManagerStanding } from '@/lib/pga/scoring'
import { formatScoreToPar } from '@/lib/pga/scoring'
import { Badge } from '@/components/ui/badge'

interface PgaLeaderboardProps {
  standings: ManagerStanding[]
  topN: number
  coursePar: number
  missedCutScore: number
}

export function PgaLeaderboard({ standings, topN, coursePar, missedCutScore }: PgaLeaderboardProps) {
  // Determine which rounds have any data
  const activeRounds: number[] = []
  for (let r = 0; r < 4; r++) {
    if (standings.some((s) => s.roundTotals[r] !== null)) {
      activeRounds.push(r)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-2 py-2 text-left text-xs text-muted-foreground w-8">#</th>
            <th className="px-2 py-2 text-left text-xs text-muted-foreground">Manager</th>
            <th className="px-2 py-2 text-center text-xs text-muted-foreground border-l">Pos</th>
            <th className="px-2 py-2 text-center text-xs text-muted-foreground">Total</th>
            {activeRounds.map((r) => (
              <th key={r} className="px-2 py-2 text-center text-xs text-muted-foreground border-l first:border-l">
                R{r + 1}
              </th>
            ))}
            <th className="px-2 py-2 text-center text-xs text-muted-foreground border-l">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, idx) => (
            <ManagerRow
              key={standing.memberId}
              standing={standing}
              rank={idx + 1}
              activeRounds={activeRounds}
              topN={topN}
            />
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
        <p className="flex items-center gap-1">
          <span className="font-bold text-[#228B22]">Green bold</span> = score counts toward manager&apos;s round total (best {topN})
        </p>
        <p>CUT/WD penalty: {missedCutScore} strokes ({formatScoreToPar(missedCutScore - coursePar)}) per round</p>
      </div>
    </div>
  )
}

function ManagerRow({
  standing,
  rank,
  activeRounds,
}: {
  standing: ManagerStanding
  rank: number
  activeRounds: number[]
  topN: number
}) {
  return (
    <>
      {/* Manager summary row */}
      <tr className="border-b bg-muted/20">
        <td className="px-2 py-2 text-muted-foreground">{rank}</td>
        <td className="px-2 py-2 font-medium whitespace-nowrap">
          {standing.memberName}
        </td>
        <td className="px-2 py-2 text-center font-bold border-l">
          {rank}
        </td>
        <td className="px-2 py-2 text-center font-bold">
          {formatScoreToPar(standing.cumulativeScore)}
        </td>
        {activeRounds.map((r) => (
          <td key={r} className="px-2 py-2 text-center font-medium border-l">
            {formatScoreToPar(standing.roundTotals[r])}
          </td>
        ))}
        <td className="px-2 py-2 border-l" />
      </tr>

      {/* Golfer rows — always expanded */}
      {standing.golfers.map((golfer) => (
        <tr key={golfer.golferId} className="border-b">
          <td className="px-2 py-1.5" />
          <td className="px-2 py-1.5 pl-6 text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-xs">{golfer.golferName}</span>
              {golfer.status === 'cut' && (
                <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">CUT</Badge>
              )}
              {golfer.status === 'withdrawn' && (
                <Badge variant="outline" className="text-[10px]">WD</Badge>
              )}
              {golfer.thru && golfer.status === 'active' && golfer.thru !== 'F' && (
                <span className="text-[10px] text-muted-foreground">thru {golfer.thru}</span>
              )}
              {golfer.teeTime && !golfer.thru && golfer.status === 'active' && (
                <span className="text-[10px] text-muted-foreground">{golfer.teeTime}</span>
              )}
            </div>
          </td>
          <td className="px-2 py-1.5 text-center text-xs text-muted-foreground border-l">
            {golfer.position ?? '—'}
          </td>
          <td className="px-2 py-1.5 text-center text-xs">
            {formatScoreToPar(golfer.totalScore)}
          </td>
          {activeRounds.map((r) => {
            const score = golfer.roundScores[r]
            const counts = golfer.countsForRound[r]
            const penalty = golfer.isPenalty[r]
            return (
              <td
                key={r}
                className={`px-2 py-1.5 text-center text-xs border-l ${
                  penalty
                    ? 'text-muted-foreground/50 italic'
                    : counts
                      ? 'font-bold'
                      : 'text-muted-foreground'
                }`}
                style={counts && !penalty ? { color: '#228B22' } : undefined}
              >
                {formatScoreToPar(score)}
              </td>
            )
          })}
          <td className="px-2 py-1.5 text-center text-xs border-l">
            {formatScoreToPar(golfer.contribution)}
          </td>
        </tr>
      ))}
    </>
  )
}
