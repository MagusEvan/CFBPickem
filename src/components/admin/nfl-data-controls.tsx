'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  adminRefreshPlayerCatalog,
  adminRefreshSchedule,
  adminRefreshWeekStats,
} from '@/lib/admin/data-actions'
import { refreshFfRankings } from '@/lib/ff/ranking-actions'

export function NflDataControls({
  seasonYear,
  currentWeek,
}: {
  seasonYear: number
  currentWeek: number
}) {
  const router = useRouter()
  const [week, setWeek] = useState(String(currentWeek))
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const run = (label: string, action: () => Promise<string>) => {
    setBusy(true)
    setStatus(`${label}…`)
    startTransition(async () => {
      try {
        setStatus(await action())
        router.refresh()
      } catch (err) {
        setStatus(err instanceof Error ? err.message : `${label} failed`)
      } finally {
        setBusy(false)
      }
    })
  }

  const weekNum = Number.parseInt(week, 10)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run('Refreshing player catalog', async () => {
              const r = await adminRefreshPlayerCatalog(seasonYear)
              if (r.error) throw new Error(r.error)
              return `Player catalog refreshed — ${r.players} active players`
            })
          }
        >
          Refresh Player Catalog
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run('Refreshing schedule', async () => {
              const r = await adminRefreshSchedule(seasonYear)
              if (r.error) throw new Error(r.error)
              return `Schedule refreshed — ${r.games} games`
            })
          }
        >
          Refresh Schedule
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run('Refreshing rankings', async () => {
              const r = await refreshFfRankings(seasonYear)
              if ('error' in r && r.error) throw new Error(r.error)
              const s = 'summary' in r ? r.summary : null
              return s
                ? `Rankings refreshed — ESPN ${s.espn ?? 'failed'} · Yahoo ${s.yahoo ?? 'failed'} · Sleeper ${s.sleeper ?? 'failed'} · FantasyPros ${s.fantasypros ?? 'failed'}`
                : 'Rankings refreshed'
            })
          }
        >
          Refresh Rankings &amp; Market Data
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Week
          <Input
            type="number"
            min={1}
            max={18}
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className="h-8 w-16"
            disabled={busy}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !Number.isInteger(weekNum) || weekNum < 1 || weekNum > 18}
          onClick={() =>
            run(`Refreshing week ${weekNum} stats`, async () => {
              const r = await adminRefreshWeekStats(seasonYear, weekNum)
              if (r.error) throw new Error(r.error)
              return `Week ${weekNum} stats refreshed — ${r.statsRows} stat rows`
            })
          }
        >
          Refresh Week Stats
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            // One serverless call per week to stay under function timeouts
            setBusy(true)
            startTransition(async () => {
              try {
                for (let w = 1; w <= 18; w++) {
                  setStatus(`Backfilling week ${w} of 18…`)
                  const r = await adminRefreshWeekStats(seasonYear, w)
                  if (r.error) throw new Error(`Week ${w}: ${r.error}`)
                }
                setStatus(`Backfill complete for ${seasonYear} weeks 1–18`)
                router.refresh()
              } catch (err) {
                setStatus(err instanceof Error ? err.message : 'Backfill failed')
              } finally {
                setBusy(false)
              }
            })
          }}
        >
          Backfill All Weeks
        </Button>
      </div>

      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  )
}
