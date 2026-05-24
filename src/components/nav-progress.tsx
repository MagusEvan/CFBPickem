'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function NavProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // When the route changes, hide the loading bar
    setLoading(false)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [pathname, searchParams])

  useEffect(() => {
    // Intercept all link clicks to show loading bar
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return
      const href = target.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')) return
      if (target.getAttribute('target') === '_blank') return

      // Don't show for same-page links
      if (href === pathname) return

      setLoading(true)
      // Safety timeout in case navigation is instant
      timeoutRef.current = setTimeout(() => setLoading(false), 5000)
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  if (!loading) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Top progress bar */}
      <div className="h-0.5 w-full bg-muted overflow-hidden">
        <div className="h-full bg-primary animate-progress" />
      </div>
      {/* Subtle overlay spinner for longer loads */}
      <div className="flex items-center justify-center mt-[40vh] pointer-events-none">
        <div className="flex items-center gap-3 rounded-lg bg-background/90 px-4 py-3 shadow-lg ring-1 ring-foreground/10">
          <svg
            className="h-5 w-5 animate-spin text-primary"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    </div>
  )
}
