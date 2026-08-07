// Resolved waiver claims grouped by processing run — the data has always been
// stored (status/resolution/processed_at) but was never displayed.

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GameTime } from '@/components/schedule/game-time'
import type { FFWaiverClaim } from '@/lib/ff/types'

export interface ResolvedClaimRow {
  claim: FFWaiverClaim
  managerName: string
  addName: string
  dropName: string | null
}

export function WaiverResultsCard({
  rows,
  /** Cap the display to the most recent N processing runs (0 = no cap) */
  maxRuns = 0,
}: {
  rows: ResolvedClaimRow[]
  maxRuns?: number
}) {
  if (rows.length === 0) return null

  // Group by processing run (processed_at is identical within a run)
  const runs = new Map<string, ResolvedClaimRow[]>()
  for (const row of rows) {
    const key = row.claim.processed_at ?? 'unknown'
    const list = runs.get(key) ?? []
    list.push(row)
    runs.set(key, list)
  }
  const sortedRuns = [...runs.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
  const shown = maxRuns > 0 ? sortedRuns.slice(0, maxRuns) : sortedRuns

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Waiver Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {shown.map(([processedAt, runRows]) => (
          <div key={processedAt}>
            <p className="mb-1.5 text-xs text-muted-foreground">
              {processedAt !== 'unknown' ? <GameTime startTime={processedAt} /> : 'Earlier'}
            </p>
            <ul className="space-y-1 text-sm">
              {runRows.map(({ claim, managerName, addName, dropName }) => (
                <li key={claim.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Badge
                    variant={claim.status === 'won' ? 'secondary' : 'outline'}
                    className="text-[10px] uppercase"
                  >
                    {claim.status}
                  </Badge>
                  <span className="font-medium">{managerName}</span>
                  <span className="text-muted-foreground">
                    {claim.status === 'won' ? 'added' : 'bid on'} {addName}
                    {claim.bid > 0 && ` ($${claim.bid})`}
                    {dropName && claim.status === 'won' && `, dropped ${dropName}`}
                  </span>
                  {claim.resolution && claim.status !== 'won' && (
                    <span className="text-xs text-muted-foreground">— {claim.resolution}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
