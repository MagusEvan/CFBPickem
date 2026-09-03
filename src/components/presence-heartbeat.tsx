'use client'

import { useEffect } from 'react'

const INTERVAL_MS = 2 * 60 * 1000 // 2 minutes

export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      fetch('/api/heartbeat', { method: 'POST' }).catch(() => {})
    }

    // Fire immediately on mount
    ping()
    const id = setInterval(ping, INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return null
}
