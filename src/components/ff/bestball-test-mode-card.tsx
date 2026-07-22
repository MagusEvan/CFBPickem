'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { setBestBallSimulatedWeek, backfillFfStatsWeek } from '@/lib/ff/test-mode-actions'

export function BestBallTestModeCard({
  poolId,
  seasonYear,
  initialWeek,
}: {
  poolId: string
  seasonYear: number
  initialWeek: number | null
}) {
  const router = useRouter()
  const [weekInput, setWeekInput] = useState(String(initialWeek ?? 1))
  const [error, setError] = useState<string | null>(null)
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [isPending, startTransition] = useTransition()

  function setWeek(week: number | null) {
    setError(null)
    startTransition(async () => {
      const result = await setBestBallSimulatedWeek(poolId, week)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  async function runBackfill() {
    setError(null)
    setBackfilling(true)
    try {
      for (let week = 1; week <= 18; week++) {
        setBackfillStatus(`Backfilling ${seasonYear} week ${week} of 18…`)
        const result = await backfillFfStatsWeek(seasonYear, week)
        if (result.error) {
          setError(`Week ${week}: ${result.error}`)
          setBackfillStatus(null)
          return
        }
        setBackfillStatus(`Week ${week}/18 done (${result.statsRows} stat rows)`)
      }
      setBackfillStatus(`Backfill complete for ${seasonYear} weeks 1–18`)
      router.refresh()
    } finally {
      setBackfilling(false)
    }
  }

  const busy = isPending || backfilling

  return (
    <Card className="border-amber-500/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Test Mode
          <Badge variant={initialWeek !== null ? 'destructive' : 'outline'}>
            {initialWeek !== null
              ? initialWeek >= 19
                ? 'Season complete'
                : `Week ${initialWeek}`
              : 'Off'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Site admin only. Replays the {seasonYear} season: weeks before the simulated week are
          final; 19 = season complete. Rewinding deletes the playoff bracket (it regenerates).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={19}
            value={weekInput}
            onChange={(e) => setWeekInput(e.target.value)}
            className="h-8 w-20"
            disabled={busy}
          />
          <Button
            size="sm"
            disabled={busy || !weekInput}
            onClick={() => setWeek(Number(weekInput))}
          >
            {isPending && <Spinner className="mr-2" />}
            Set Week
          </Button>
          {initialWeek !== null && initialWeek < 19 && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setWeek(initialWeek + 1)}>
              Advance to {initialWeek + 1}
            </Button>
          )}
          {initialWeek !== null && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setWeek(null)}>
              Disable
            </Button>
          )}
        </div>

        <div className="space-y-1 border-t pt-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={runBackfill}>
            {backfilling && <Spinner className="mr-2" />}
            Backfill {seasonYear} Stats (weeks 1–18)
          </Button>
          {backfillStatus && <p className="text-xs text-muted-foreground">{backfillStatus}</p>}
          <p className="text-xs text-muted-foreground">
            Idempotent — already-ingested final weeks are skipped.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
