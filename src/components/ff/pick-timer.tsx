'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Countdown to the pick deadline. When it expires, calls onExpire (which
 * triggers the idempotent server-side autopick) — and keeps retrying every
 * few seconds while still expired, in case the first enforcement call raced
 * or failed. The server resolves concurrent calls to one winner.
 */
export function PickTimer({
  deadline,
  onExpire,
}: {
  deadline: string | null
  onExpire: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const lastFiredAt = useRef(0)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    if (!deadline) return
    const deadlineMs = new Date(deadline).getTime()

    const interval = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (deadlineMs - t <= 0 && t - lastFiredAt.current > 5_000) {
        lastFiredAt.current = t
        onExpireRef.current()
      }
    }, 500)
    return () => clearInterval(interval)
  }, [deadline])

  if (!deadline) return null

  const remainingMs = new Date(deadline).getTime() - now
  const clamped = Math.max(0, remainingMs)
  const totalSec = Math.ceil(clamped / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60

  return (
    <span
      className={cn(
        'font-mono text-lg font-semibold tabular-nums',
        totalSec <= 10 && 'animate-pulse text-destructive'
      )}
    >
      {remainingMs <= 0 ? 'Autopicking…' : `${min}:${String(sec).padStart(2, '0')}`}
    </span>
  )
}
