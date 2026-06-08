'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
  const router = useRouter()

  function handleRefresh() {
    startTransition(async () => {
      await refreshAction(poolId)
      router.refresh()
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
        <Button
          variant="outline"
          size="xs"
          onClick={handleRefresh}
          disabled={isPending}
        >
          {isPending ? 'Refreshing...' : 'Refresh Scores'}
        </Button>
      )}
    </div>
  )
}
