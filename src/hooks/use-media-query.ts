'use client'

import { useSyncExternalStore, useCallback } from 'react'

/**
 * SSR-safe media query hook. Returns false on the server and during the
 * first client render, then updates to the real match state.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    [query]
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** Matches Tailwind's `md` breakpoint. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}
