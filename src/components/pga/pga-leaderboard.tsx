'use client'

import { useState } from 'react'
import type { ManagerStanding } from '@/lib/pga/scoring'
import { formatScoreToPar } from '@/lib/pga/scoring'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'

interface PgaLeaderboardProps {
  standings: ManagerStanding[]
  topN: number
  coursePar: number
  missedCutScore: number
  countingHighlightColor?: string | null
}

export function PgaLeaderboard({ standings, topN, coursePar, missedCutScore, countingHighlightColor }: PgaLeaderboardProps) {
  const highlightBg = countingHighlightColor || null
  // Determine which rounds have any data
  const activeRounds: number[] = []
  for (let r = 0; r < 4; r++) {
    if (standings.some((s) => s.roundTotals[r] !== null)) {
      activeRounds.push(r)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {standings.map((standing, idx) => (
          <ManagerCard
            key={standing.memberId}
            standing={standing}
            rank={idx + 1}
            activeRounds={activeRounds}
            highlightBg={highlightBg}
          />
        ))}
      </div>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>
          <span className="font-bold text-[#228B22]">Green bold</span> = score counts toward team&apos;s round total (best {topN})
        </p>
        <p>CUT/WD penalty: {missedCutScore} strokes ({formatScoreToPar(missedCutScore - coursePar)}) per round</p>
        <p>Click a team to see strokes per round and each golfer&apos;s counting contribution.</p>
      </div>
    </div>
  )
}

function ManagerCard({
  standing,
  rank,
  activeRounds,
  highlightBg,
}: {
  standing: ManagerStanding
  rank: number
  activeRounds: number[]
  highlightBg: string | null
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="py-0">
      <CardContent className="px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-baseline justify-between gap-2 border-b pb-1.5 text-left"
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">#{rank}</span>
            <span className="truncate text-sm font-medium">{standing.memberName}</span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-sm font-bold tabular-nums">
              {formatScoreToPar(standing.cumulativeScore)}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 self-center text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </span>
        </button>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-muted-foreground">
              <th className="py-1 text-left font-normal">Golfer</th>
              <th className="w-9 py-1 text-center font-normal">Pos</th>
              {activeRounds.map((r) => (
                <th key={r} className="w-8 py-1 text-center font-normal">R{r + 1}</th>
              ))}
              <th className="w-9 py-1 text-center font-normal">Tot</th>
              {expanded && <th className="w-9 py-1 text-center font-normal">Cont</th>}
            </tr>
          </thead>
          <tbody>
            {standing.golfers.map((golfer) => (
              <tr key={golfer.golferId} className="border-t border-border/50 align-top">
                <td className="max-w-0 py-0.5 pr-1">
                  <div className="flex items-baseline gap-1.5 overflow-hidden">
                    <span className="truncate text-muted-foreground">{golfer.golferName}</span>
                    {golfer.status === 'cut' && (
                      <span className="shrink-0 text-[9px] font-semibold text-destructive">CUT</span>
                    )}
                    {golfer.status === 'withdrawn' && (
                      <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">WD</span>
                    )}
                    {golfer.thru && golfer.status === 'active' && golfer.thru !== 'F' && (
                      <span className="shrink-0 text-[9px] text-muted-foreground">{golfer.thru}</span>
                    )}
                    {golfer.teeTime && !golfer.thru && golfer.status === 'active' && (
                      <span className="shrink-0 text-[9px] text-muted-foreground">{golfer.teeTime}</span>
                    )}
                  </div>
                </td>
                <td className="py-0.5 text-center text-muted-foreground">
                  {golfer.position ?? '—'}
                </td>
                {activeRounds.map((r) => {
                  const score = golfer.roundScores[r]
                  const strokes = golfer.roundStrokes[r]
                  const counts = golfer.countsForRound[r]
                  const penalty = golfer.isPenalty[r]
                  const cellStyle: React.CSSProperties = {}
                  if (counts && !penalty) {
                    cellStyle.color = '#228B22'
                    if (highlightBg) cellStyle.backgroundColor = highlightBg
                  }
                  return (
                    <td
                      key={r}
                      className={`py-0.5 text-center tabular-nums ${
                        penalty
                          ? 'italic text-muted-foreground/50'
                          : counts
                            ? 'font-bold'
                            : 'text-muted-foreground'
                      }`}
                      style={Object.keys(cellStyle).length > 0 ? cellStyle : undefined}
                    >
                      {formatScoreToPar(score)}
                      {expanded && (
                        <span className="block text-[9px] font-normal not-italic text-muted-foreground">
                          {strokes ?? '—'}
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="py-0.5 text-center tabular-nums">
                  {formatScoreToPar(golfer.totalScore)}
                  {expanded && (
                    <span className="block text-[9px] text-muted-foreground">
                      {golfer.totalStrokes ?? '—'}
                    </span>
                  )}
                </td>
                {expanded && (
                  <td className="py-0.5 text-center font-medium tabular-nums">
                    {formatScoreToPar(golfer.contribution)}
                  </td>
                )}
              </tr>
            ))}
            {/* Team round totals */}
            <tr className="border-t font-medium">
              <td className="py-1">Team</td>
              <td />
              {activeRounds.map((r) => (
                <td key={r} className="py-1 text-center tabular-nums">
                  {formatScoreToPar(standing.roundTotals[r])}
                </td>
              ))}
              <td className="py-1 text-center font-bold tabular-nums">
                {formatScoreToPar(standing.cumulativeScore)}
                {expanded && (
                  <span className="block text-[9px] font-normal text-muted-foreground">
                    {standing.cumulativeStrokes ?? '—'}
                  </span>
                )}
              </td>
              {expanded && <td />}
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
