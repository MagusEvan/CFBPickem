'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { addFfFreeAgent, dropFfPlayer, submitFfWaiverClaim } from '@/lib/ff/waiver-actions'
import { PlayerDetailSheet } from './player-detail-sheet'
import type { FFSeasonTotals } from '@/lib/ff/queries'
import type { FFPlayer, FFPosition } from '@/lib/ff/types'

const POSITIONS: Array<FFPosition | 'ALL'> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']
const PAGE_SIZE = 50

export interface PlayersTransactionContext {
  poolId: string
  /** player_id -> owning manager's display name */
  ownerByPlayer: Record<string, string>
  /** player ids on the caller's roster */
  myPlayerIds: string[]
  /** player ids still on waivers (recently dropped) */
  waiverLockedIds: string[]
  waiversType: 'faab' | 'priority' | 'none'
  faabRemaining: number
  rosterFull: boolean
  /** caller's roster, for the drop picker */
  myRoster: Array<{ id: string; name: string; position: string }>
}

type Availability = 'ALL' | 'AVAILABLE'

export function PlayersBrowser({
  players,
  tx,
  poolId,
  seasonTotals,
}: {
  players: FFPlayer[]
  /** Present once the draft is complete and the caller can transact */
  tx?: PlayersTransactionContext
  /** Enables the player detail dialog (click a name) */
  poolId?: string
  /** player_id -> season points; enables Pts/Avg columns */
  seasonTotals?: Record<string, FFSeasonTotals>
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<FFPosition | 'ALL'>('ALL')
  const [availability, setAvailability] = useState<Availability>(tx ? 'AVAILABLE' : 'ALL')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detailPlayer, setDetailPlayer] = useState<FFPlayer | null>(null)
  const [sortBy, setSortBy] = useState<'default' | 'totalPts' | 'avgPts'>('default')
  const [dropId, setDropId] = useState('')
  const [bid, setBid] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const myIds = useMemo(() => new Set(tx?.myPlayerIds ?? []), [tx])
  const locked = useMemo(() => new Set(tx?.waiverLockedIds ?? []), [tx])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = players.filter(
      (p) =>
        (position === 'ALL' || p.position === position) &&
        (availability === 'ALL' || !tx || !tx.ownerByPlayer[p.id]) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.nfl_team_abbrev ?? '').toLowerCase().includes(q))
    )
    if (sortBy !== 'default' && seasonTotals) {
      return [...matches].sort(
        (a, b) => (seasonTotals[b.id]?.[sortBy] ?? 0) - (seasonTotals[a.id]?.[sortBy] ?? 0)
      )
    }
    return matches
  }, [players, search, position, availability, tx, sortBy, seasonTotals])

  const visible = filtered.slice(0, limit)

  const colCount = 6 + (seasonTotals ? 2 : 0) + (tx ? 1 : 0)

  const sortHeader = (key: 'totalPts' | 'avgPts', label: string) => (
    <th className="px-3 py-2 text-right font-medium">
      <button
        type="button"
        className={sortBy === key ? 'font-semibold text-foreground' : 'hover:text-foreground'}
        onClick={() => setSortBy(sortBy === key ? 'default' : key)}
      >
        {label}
        {sortBy === key && ' ↓'}
      </button>
    </th>
  )

  const openPanel = (playerId: string) => {
    setOpenId(openId === playerId ? null : playerId)
    setDropId('')
    setBid('0')
    setError(null)
  }

  const run = (action: () => Promise<{ error?: string }>) => {
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
      } else {
        setOpenId(null)
        router.refresh()
      }
    })
  }

  const renderAction = (p: FFPlayer) => {
    if (!tx) return null
    if (myIds.has(p.id)) {
      return (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => openPanel(p.id)}>
          Drop
        </Button>
      )
    }
    if (tx.ownerByPlayer[p.id]) return null
    const isClaim = tx.waiversType !== 'none' && locked.has(p.id)
    return (
      <Button size="sm" variant={isClaim ? 'secondary' : 'default'} disabled={pending} onClick={() => openPanel(p.id)}>
        {isClaim ? 'Claim' : 'Add'}
      </Button>
    )
  }

  const renderPanel = (p: FFPlayer) => {
    if (!tx || openId !== p.id) return null

    if (myIds.has(p.id)) {
      return (
        <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Drop {p.name}?{tx.waiversType !== 'none' && ' They will go on waivers.'}
          </span>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => run(() => dropFfPlayer(tx.poolId, p.id))}
          >
            {pending ? 'Dropping…' : 'Confirm drop'}
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )
    }

    const isClaim = tx.waiversType !== 'none' && locked.has(p.id)
    const needsDrop = tx.rosterFull
    const dropMissing = needsDrop && !dropId

    return (
      <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-3 py-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs"
          value={dropId}
          onChange={(e) => setDropId(e.target.value)}
          disabled={pending}
        >
          <option value="">{needsDrop ? 'Choose a player to drop…' : 'No drop (roster has room)'}</option>
          {tx.myRoster.map((r) => (
            <option key={r.id} value={r.id}>
              Drop: {r.position} {r.name}
            </option>
          ))}
        </select>
        {isClaim && tx.waiversType === 'faab' && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Bid $
            <Input
              type="number"
              min={0}
              max={tx.faabRemaining}
              value={bid}
              onChange={(e) => setBid(e.target.value)}
              className="h-8 w-20"
              disabled={pending}
            />
            <span>of ${tx.faabRemaining}</span>
          </label>
        )}
        <Button
          size="sm"
          disabled={pending || dropMissing}
          onClick={() =>
            run(() =>
              isClaim
                ? submitFfWaiverClaim(tx.poolId, p.id, dropId || null, Number.parseInt(bid, 10) || 0)
                : addFfFreeAgent(tx.poolId, p.id, dropId || null)
            )
          }
        >
          {pending ? 'Working…' : isClaim ? 'Submit claim' : 'Add player'}
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    )
  }

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
          {tx && (
            <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={availability === 'AVAILABLE'}
                onChange={(e) => {
                  setAvailability(e.target.checked ? 'AVAILABLE' : 'ALL')
                  setLimit(PAGE_SIZE)
                }}
              />
              Available only
            </label>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Pos</th>
              <th className="px-3 py-2 font-medium">Team</th>
              {seasonTotals && sortHeader('totalPts', 'Pts')}
              {seasonTotals && sortHeader('avgPts', 'Avg')}
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">%Rost</th>
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Proj</th>
              <th className="px-3 py-2 font-medium">{tx ? 'Manager' : 'Status'}</th>
              {tx && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-b last:border-0 hover:bg-muted/30">
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
                      {poolId ? (
                        <button
                          type="button"
                          className="font-medium underline-offset-2 hover:underline"
                          onClick={() => setDetailPlayer(p)}
                        >
                          {p.name}
                        </button>
                      ) : (
                        <span className="font-medium">{p.name}</span>
                      )}
                      {p.injury_status && (
                        <Badge variant="destructive" className="text-[10px] uppercase">
                          {p.injury_status}
                        </Badge>
                      )}
                      {tx && tx.waiversType !== 'none' && locked.has(p.id) && !tx.ownerByPlayer[p.id] && (
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          Waivers
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{p.position}</td>
                  <td className="px-3 py-2">{p.nfl_team_abbrev ?? '—'}</td>
                  {seasonTotals && (
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {(seasonTotals[p.id]?.totalPts ?? 0).toFixed(1)}
                    </td>
                  )}
                  {seasonTotals && (
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {(seasonTotals[p.id]?.avgPts ?? 0).toFixed(1)}
                    </td>
                  )}
                  <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                    {p.percent_owned !== null ? `${p.percent_owned.toFixed(1)}%` : '—'}
                  </td>
                  <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                    {p.proj_season_pts !== null ? p.proj_season_pts.toFixed(0) : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {tx
                      ? tx.ownerByPlayer[p.id] ?? 'Free agent'
                      : (p.status?.replace(/-/g, ' ') ?? '—')}
                  </td>
                  {tx && <td className="px-3 py-2 text-right">{renderAction(p)}</td>}
                </tr>
                {openId === p.id && (
                  <tr className="border-b last:border-0">
                    <td colSpan={colCount} className="p-0">
                      {renderPanel(p)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground">
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

      {poolId && (
        <PlayerDetailSheet
          poolId={poolId}
          player={detailPlayer}
          onClose={() => setDetailPlayer(null)}
        />
      )}
    </div>
  )
}
