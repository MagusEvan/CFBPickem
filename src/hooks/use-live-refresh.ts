'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const POLL_MS = 60_000

/**
 * Near-real-time score pages: while play is live and the tab is visible,
 * refresh the server component tree every 60s (the staleness gate upstream
 * dedupes actual ESPN fetches). Also refreshes when the tab becomes
 * visible again.
 */
export function useLiveRefresh(live: boolean) {
  const router = useRouter()

  useEffect(() => {
    if (!live) return

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, POLL_MS)

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [live, router])
}
