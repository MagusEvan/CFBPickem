'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FFPlayer, FFPosition } from '@/lib/ff/types'

const POSITIONS: Array<FFPosition | 'ALL'> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']
const PAGE_SIZE = 50

export function PlayersBrowser({ players }: { players: FFPlayer[] }) {
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<FFPosition | 'ALL'>('ALL')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return players.filter(
      (p) =>
        (position === 'ALL' || p.position === position) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.nfl_team_abbrev ?? '').toLowerCase().includes(q))
    )
  }, [players, search, position])

  const visible = filtered.slice(0, limit)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search players or teams..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setLimit(PAGE_SIZE)
          }}
          className="sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
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
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Pos</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {p.headshot_url ? (
                      <Image
                        src={p.headshot_url}
                        alt=""
                        width={28}
                        height={28}
                        className="h-7 w-7 rounded-full bg-muted object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="h-7 w-7 rounded-full bg-muted" />
                    )}
                    <span className="font-medium">{p.name}</span>
                    {p.injury_status && (
                      <Badge variant="destructive" className="text-[10px] uppercase">
                        {p.injury_status}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">{p.position}</td>
                <td className="px-3 py-2">{p.nfl_team_abbrev ?? '—'}</td>
                <td className="px-3 py-2 capitalize text-muted-foreground">
                  {p.status?.replace(/-/g, ' ') ?? '—'}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No players found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE * 4)}>
            Show more ({filtered.length - limit} remaining)
          </Button>
        </div>
      )}
    </div>
  )
}
