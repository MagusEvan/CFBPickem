'use client'

import { useEffect } from 'react'

export function TimezoneCookie() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (document.cookie.includes(`tz=${tz}`)) return
    document.cookie = `tz=${tz};path=/;max-age=31536000;SameSite=Lax`
  }, [])
  return null
}
