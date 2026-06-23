'use client'

import { useState } from 'react'
import type { ManagerStanding } from '@/lib/pga/scoring'
import { formatScoreToPar } from '@/lib/pga/scoring'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface PgaLeaderboardProps {
  standings: ManagerStanding[]
  topN: number
}

export function PgaLeaderboard({ standings, topN }: PgaLeaderboardProps) {
  const [expandedManager, setExpandedManager] = useState<string | null>(null)

  function toggleManager(id: string) {
    setExpandedManager((prev) => (prev === id ? null : id))
  }

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
            {activeRounds.map((r) => (
              <th key={r} className="px-2 py-2 text-center text-xs text-muted-foreground">
                R{r + 1}
              </th>
            ))}
            <th className="px-2 py-2 text-center text-xs text-muted-foreground border-l">Strokes</th>
            <th className="px-2 py-2 text-center text-xs text-muted-foreground">Score</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, idx) => {
            const isExpanded = expandedManager === standing.memberId
            return (
              <ManagerRow
                key={standing.memberId}
                standing={standing}
                rank={idx + 1}
                activeRounds={activeRounds}
                isExpanded={isExpanded}
                onToggle={() => toggleManager(standing.memberId)}
                topN={topN}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ManagerRow({
  standing,
  rank,
  activeRounds,
  isExpanded,
  onToggle,
  topN,
}: {
  standing: ManagerStanding
  rank: number
  activeRounds: number[]
  isExpanded: boolean
  onToggle: () => void
  topN: number
}) {
  return (
    <>
      {/* Manager summary row */}
      <tr
        className="border-b cursor-pointer transition-colors hover:bg-muted/50"
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-muted-foreground">{rank}</td>
        <td className="px-2 py-2 font-medium whitespace-nowrap">
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {standing.memberName}
          </div>
        </td>
        {activeRounds.map((r) => (
          <td key={r} className="px-2 py-2 text-center font-medium">
            {standing.roundTotals[r] ?? '—'}
          </td>
        ))}
        <td className="px-2 py-2 text-center font-bold border-l">
          {standing.cumulativeStrokes ?? '—'}
        </td>
        <td className="px-2 py-2 text-center font-bold">
          {formatScoreToPar(standing.cumulativeScore)}
        </td>
      </tr>

      {/* Expanded golfer rows */}
      {isExpanded && standing.golfers.map((golfer) => (
        <tr key={golfer.golferId} className="border-b bg-muted/30">
          <td className="px-2 py-1.5" />
          <td className="px-2 py-1.5 pl-8 text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-xs">{golfer.golferName}</span>
              {golfer.status === 'cut' && (
                <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">CUT</Badge>
              )}
              {golfer.status === 'withdrawn' && (
                <Badge variant="outline" className="text-[10px]">WD</Badge>
              )}
              {golfer.position && golfer.status === 'active' && (
                <span className="text-[10px] text-muted-foreground">({golfer.position})</span>
              )}
              {golfer.thru && golfer.status === 'active' && golfer.thru !== 'F' && (
                <span className="text-[10px] text-muted-foreground">thru {golfer.thru}</span>
              )}
              {golfer.teeTime && !golfer.thru && golfer.status === 'active' && (
                <span className="text-[10px] text-muted-foreground">{golfer.teeTime}</span>
              )}
            </div>
          </td>
          {activeRounds.map((r) => {
            const strokes = golfer.roundStrokes[r]
            const counts = golfer.countsForRound[r]
            return (
              <td
                key={r}
                className={`px-2 py-1.5 text-center text-xs ${
                  counts ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {strokes ?? '—'}
                {counts && <span className="text-[8px] text-primary ml-0.5">*</span>}
              </td>
            )
          })}
          <td className="px-2 py-1.5 text-center text-xs border-l">
            {golfer.totalStrokes ?? '—'}
          </td>
          <td className="px-2 py-1.5 text-center text-xs">
            {formatScoreToPar(golfer.totalScore)}
          </td>
        </tr>
      ))}
    </>
  )
}
