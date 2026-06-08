'use client'

import { useEffect, useState } from 'react'

function formatInTimezone(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone }) +
    ' \u00b7 ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short' })
}

export function GameTime({ startTime }: { startTime: string }) {
  const [formatted, setFormatted] = useState<string>(() => {
    // SSR fallback: Central Time
    return formatInTimezone(new Date(startTime), 'America/Chicago')
  })

  useEffect(() => {
    // Client-side: use the browser's local timezone
    const d = new Date(startTime)
    const local = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' \u00b7 ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    setFormatted(local)
  }, [startTime])

  return <>{formatted}</>
}
