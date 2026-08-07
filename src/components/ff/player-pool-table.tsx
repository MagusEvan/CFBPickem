'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FFPlayer, FFPosition } from '@/lib/ff/types'

const POSITIONS: Array<FFPosition | 'ALL'> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']
const PAGE_SIZE = 40

export function PlayerPoolTable({
  players,
  byeWeeks,
  draftedIds,
  canPick,
  pendingPlayerId,
  onPick,
  actionLabel = 'Draft',
  pendingLabel = 'Drafting…',
  showAuctionValues = false,
}: {
  players: FFPlayer[]
  /** team_id -> regular-season bye week */
  byeWeeks: Record<string, number>
  draftedIds: Set<string>
  canPick: boolean
  pendingPlayerId: string | null
  onPick: (player: FFPlayer) => void
  actionLabel?: string
  pendingLabel?: string
  /** Auction drafts: show average auction value next to each player */
  showAuctionValues?: boolean
}) {
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<FFPosition | 'ALL'>('ALL')
  const [showDrafted, setShowDrafted] = useState(false)
  const [sortByAdp, setSortByAdp] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const hasAdp = useMemo(() => players.some((p) => p.adp !== null), [players])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = players.filter(
      (p) =>
        (showDrafted || !draftedIds.has(p.id)) &&
        (position === 'ALL' || p.position === position) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.nfl_team_abbrev ?? '').toLowerCase().includes(q))
    )
    if (sortByAdp) {
      const inf = Number.POSITIVE_INFINITY
      return [...matches].sort((a, b) => (a.adp ?? inf) - (b.adp ?? inf))
    }
    return matches // already sorted by default_rank from the server
  }, [players, draftedIds, search, position, showDrafted, sortByAdp])

  const visible = filtered.slice(0, limit)

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <Input
          placeholder="Search players or teams..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setLimit(PAGE_SIZE)
          }}
        />
        <div className="flex flex-wrap items-center gap-1">
          {POSITIONS.map((pos) => (
            <Button
              key={pos}
              size="sm"
              variant={position === pos ? 'default' : 'outline'}
              onClick={() => {
                setPosition(pos)
                setLimit(PAGE_SIZE)
              }}
            >
              {pos === 'ALL' ? 'All' : pos}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            {hasAdp && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={sortByAdp}
                  onChange={(e) => setSortByAdp(e.target.checked)}
                />
                Sort by ADP
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showDrafted}
                onChange={(e) => setShowDrafted(e.target.checked)}
              />
              Show drafted
            </label>
          </div>
        </div>
      </div>

      <div className="max-h-[28rem] overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <tbody>
            {visible.map((p) => {
              const drafted = draftedIds.has(p.id)
              const bye = p.nfl_team_id ? byeWeeks[p.nfl_team_id] : undefined
              return (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      {p.default_rank !== null && (
                        <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {p.default_rank}
                        </span>
                      )}
                      {p.headshot_url ? (
                        <Image
                          src={p.headshot_url}
                          alt=""
                          width={24}
                          height={24}
                          className="h-6 w-6 rounded-full bg-muted object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="h-6 w-6 rounded-full bg-muted" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={drafted ? 'text-muted-foreground line-through' : 'font-medium'}>
                            {p.name}
                          </span>
                          {p.tier !== null && (
                            <Badge variant="outline" className="px-1 text-[10px]">
                              T{p.tier}
                            </Badge>
                          )}
                          {p.injury_status && (
                            <Badge variant="destructive" className="text-[10px] uppercase">
                              {p.injury_status}
                            </Badge>
                          )}
                        </div>
                        <span className="block text-xs text-muted-foreground">
                          {p.pos_rank ?? p.position} · {p.nfl_team_abbrev ?? 'FA'}
                          {bye != null && ` · Bye ${bye}`}
                          {p.adp !== null && ` · ADP ${p.adp.toFixed(1)}`}
                          {showAuctionValues &&
                            p.auction_value !== null &&
                            ` · $${Math.round(p.auction_value)}`}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {!drafted && (
                      <Button
                        size="sm"
                        disabled={!canPick || pendingPlayerId !== null}
                        onClick={() => onPick(p)}
                      >
                        {pendingPlayerId === p.id ? pendingLabel : actionLabel}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground">No players found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setLimit((l) => l + PAGE_SIZE * 3)}>
          Show more ({filtered.length - limit} remaining)
        </Button>
      )}
    </div>
  )
}
