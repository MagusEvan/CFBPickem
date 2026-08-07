'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface LeagueNavTab {
  href: string
  label: string
  /** Show a pulsing live badge (draft in progress) */
  live?: boolean
}

/**
 * League-level tab bar rendered by the pool layout for FF-family pools.
 * Client component because layouts don't re-render on navigation — active
 * state has to come from usePathname.
 */
export function LeagueNav({ poolId, tabs }: { poolId: string; tabs: LeagueNavTab[] }) {
  const pathname = usePathname()
  const homeHref = `/pools/${poolId}`

  const isActive = (href: string) =>
    href === homeHref ? pathname === homeHref : pathname.startsWith(href)

  return (
    <nav className="mb-4 overflow-x-auto border-b">
      <div className="flex w-max min-w-full gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              isActive(tab.href)
                ? 'border-primary font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.live && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px] uppercase">
                Live
              </Badge>
            )}
          </Link>
        ))}
      </div>
    </nav>
  )
}
