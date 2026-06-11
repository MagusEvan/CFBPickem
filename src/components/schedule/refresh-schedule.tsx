'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, Check } from 'lucide-react'
import { GameTime } from './game-time'

export function ScheduleHeader({
  lastFetchedAt,
  isAdmin,
  poolId,
  refreshAction,
}: {
  lastFetchedAt: string | null
  isAdmin: boolean
  poolId: string
  refreshAction: (poolId: string) => Promise<{ error?: string }>
}) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  function handleRefresh() {
    setResult(null)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await refreshAction(poolId)
      if (res?.error) {
        setResult('error')
        setErrorMsg(res.error)
      } else {
        setResult('success')
        router.refresh()
        setTimeout(() => setResult(null), 4000)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {lastFetchedAt && (
        <span className="text-xs text-muted-foreground">
          Last updated: <GameTime startTime={lastFetchedAt} />
        </span>
      )}
      {isAdmin && (
        <>
          <Button
            variant="outline"
            size="xs"
            onClick={handleRefresh}
            disabled={isPending}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'Refreshing…' : 'Refresh Scores'}
          </Button>
          {result === 'success' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" />
              Updated
            </span>
          )}
          {result === 'error' && (
            <span className="text-xs text-destructive">
              {errorMsg || 'Refresh failed'}
            </span>
          )}
        </>
      )}
    </div>
  )
}
