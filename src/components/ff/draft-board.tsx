'use client'

import { cn } from '@/lib/utils'
import type { FFDraftPick } from '@/lib/ff/types'
import type { PoolMember, Profile } from '@/lib/types'
import { OnlineDot } from '@/components/online-dot'

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-500/10 text-red-700 dark:text-red-400',
  RB: 'bg-green-500/10 text-green-700 dark:text-green-400',
  WR: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  TE: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  K: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  DST: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
}

export function DraftBoard({
  members,
  picks,
  rounds,
  currentPickNumber,
}: {
  members: (PoolMember & { profiles: Profile })[]
  picks: FFDraftPick[]
  rounds: number
  currentPickNumber: number | null
}) {
  const ordered = [...members].sort(
    (a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99)
  )
  const n = ordered.length
  const pickByNumber = new Map(picks.map((p) => [p.pick_number, p]))

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[40rem] text-xs">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-8 px-2 py-2 text-muted-foreground">Rd</th>
            {ordered.map((m) => (
              <th key={m.id} className="truncate px-2 py-2 text-left font-medium">
                {m.profiles.display_name}<OnlineDot lastActiveAt={m.profiles.last_active_at} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, r) => {
            const round = r + 1
            const reversed = round % 2 === 0
            return (
              <tr key={round} className="border-b last:border-0">
                <td className="px-2 py-1 text-center text-muted-foreground">{round}</td>
                {ordered.map((m, i) => {
                  const posInRound = reversed ? n - 1 - i : i
                  const pickNumber = (round - 1) * n + posInRound + 1
                  const pick = pickByNumber.get(pickNumber)
                  const isCurrent = pickNumber === currentPickNumber
                  return (
                    <td
                      key={m.id}
                      className={cn(
                        'px-1 py-1',
                        isCurrent && 'ring-2 ring-inset ring-primary'
                      )}
                    >
                      {pick ? (
                        <div
                          className={cn(
                            'rounded px-1.5 py-0.5',
                            POSITION_COLORS[pick.player_position] ?? 'bg-muted'
                          )}
                        >
                          <span className="block truncate font-medium">{pick.player_name}</span>
                          <span className="text-[10px] opacity-70">
                            {pick.player_position}
                            {pick.auto ? ' · auto' : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="block px-1.5 text-muted-foreground/40">
                          {pickNumber}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
