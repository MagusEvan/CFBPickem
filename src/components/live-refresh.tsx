'use client'

import { useLiveRefresh } from '@/hooks/use-live-refresh'

/** Invisible: keeps score-bearing pages fresh while play is live. */
export function LiveRefresh({ live }: { live: boolean }) {
  useLiveRefresh(live)
  return null
}
