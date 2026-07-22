'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Gavel } from 'lucide-react'
import { useCalcuttaRealtime } from '@/hooks/use-calcutta-realtime'
import type { CalcuttaSettings } from '@/lib/pga/calcutta-types'
import { DEFAULT_CALCUTTA_SETTINGS } from '@/lib/pga/calcutta-types'
import type { PgaTournament, PgaTournamentMember, PgaGolfer, PgaCalcuttaLot } from '@/lib/types'
import {
  placeCalcuttaBid,
  hammerCalcuttaLot,
  closeCalcuttaLotIfExpired,
  recordCalcuttaLotResult,
  undoLastCalcuttaLot,
  resetCalcuttaAuction,
} from '@/lib/pga/calcutta-actions'

function fmtMoney(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

export function CalcuttaAuctionRoom({
  tournament,
  poolId,
  members,
  golfers,
  currentUserId,
  isAdmin,
}: {
  tournament: PgaTournament
  poolId: string
  members: PgaTournamentMember[]
  golfers: PgaGolfer[]
  currentUserId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const settings: CalcuttaSettings = tournament.calcutta_settings ?? DEFAULT_CALCUTTA_SETTINGS
  const { draftState, lots, bids, tournamentStatus, loading } = useCalcuttaRealtime(tournament.id)
  const status = tournamentStatus ?? tournament.draft_status

  const [bidAmount, setBidAmount] = useState('')
  const [onBehalfId, setOnBehalfId] = useState('')
  const [winnerId, setWinnerId] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const memberName = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m.pool_member?.profiles?.display_name ?? '—']))
    return (id: string | null) => (id ? map.get(id) ?? '—' : '—')
  }, [members])
  const golferById = useMemo(() => new Map(golfers.map((g) => [g.id, g])), [golfers])
  const myMember = members.find((m) => m.pool_member?.user_id === currentUserId)

  const currentLot = lots.find((l) => l.id === draftState?.current_lot_id) ?? null
  const pot = lots.filter((l) => l.status === 'sold').reduce((s, l) => s + (l.price ?? 0), 0)

  // ---- Countdown from lot_deadline, with server-verified expiry ----
  const [now, setNow] = useState(() => Date.now())
  const expiryFiredFor = useRef<string | null>(null)
  const deadline = draftState?.lot_deadline ? new Date(draftState.lot_deadline).getTime() : null
  const remainingMs = deadline !== null ? deadline - now : null

  useEffect(() => {
    if (status !== 'in_progress' || settings.mode !== 'live') return
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [status, settings.mode])

  useEffect(() => {
    if (
      status === 'in_progress' &&
      settings.mode === 'live' &&
      deadline !== null &&
      remainingMs !== null &&
      remainingMs <= 0 &&
      currentLot
    ) {
      const key = `${currentLot.id}:${deadline}`
      if (expiryFiredFor.current !== key) {
        expiryFiredFor.current = key
        closeCalcuttaLotIfExpired(tournament.id, poolId).then(() => router.refresh())
      }
    }
  }, [status, settings.mode, deadline, remainingMs, currentLot, tournament.id, poolId, router])

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const minNextBid =
    draftState?.lot_high_bid === null || draftState?.lot_high_bid === undefined
      ? settings.minOpeningBid
      : draftState.lot_high_bid + settings.minRaise

  function submitBid(amount: number) {
    run(async () => {
      const result = await placeCalcuttaBid(
        tournament.id,
        poolId,
        amount,
        isAdmin && onBehalfId ? onBehalfId : undefined
      )
      if (!result.error) setBidAmount('')
      return result
    })
  }

  function lotGolferNames(lot: PgaCalcuttaLot): string {
    return lot.golfer_ids.map((id) => golferById.get(id)?.name ?? '?').join(', ')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const header = (
    <div className="space-y-4">
      <Link
        href={`/pools/${poolId}/tournaments/${tournament.id}?view=details`}
        className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Tournament
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-sm text-muted-foreground">
            Calcutta auction · Pot: {fmtMoney(pot)}
            {draftState && draftState.auction_cycle > 1 && ` · Pass ${draftState.auction_cycle}`}
          </p>
        </div>
        <Badge variant={status === 'completed' ? 'secondary' : 'outline'}>
          {status === 'pre_draft' && 'Not started'}
          {status === 'in_progress' && 'Live'}
          {status === 'completed' && 'Complete'}
        </Badge>
      </div>
    </div>
  )

  if (status === 'pre_draft') {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>The auction hasn&apos;t started yet.</p>
            {isAdmin && (
              <p className="mt-1 text-sm">
                Configure odds, lots, and payouts on the{' '}
                <Link
                  href={`/pools/${poolId}/tournaments/${tournament.id}?view=details`}
                  className="underline"
                >
                  tournament page
                </Link>
                , then start the auction there.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const soldLots = lots.filter((l) => l.status === 'sold')
  const pendingLots = lots.filter((l) => l.status === 'pending')

  return (
    <div className="space-y-6">
      {header}

      {status === 'in_progress' && currentLot && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                On the block: {currentLot.label}
                {currentLot.kind === 'scraps' && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {lotGolferNames(currentLot)}
                  </span>
                )}
              </span>
              {settings.mode === 'live' && remainingMs !== null && (
                <span
                  className={`font-mono text-2xl tabular-nums ${
                    remainingMs <= 5000 ? 'text-destructive' : ''
                  }`}
                >
                  {Math.max(0, Math.ceil(remainingMs / 1000))}s
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold">
                {draftState?.lot_high_bid !== null && draftState?.lot_high_bid !== undefined
                  ? fmtMoney(draftState.lot_high_bid)
                  : 'No bids'}
              </span>
              {draftState?.lot_high_bidder_id && (
                <span className="text-muted-foreground">
                  {memberName(draftState.lot_high_bidder_id)}
                </span>
              )}
            </div>

            {settings.mode === 'live' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={minNextBid}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && bidAmount) submitBid(Number(bidAmount))
                    }}
                    placeholder={`${minNextBid}+`}
                    className="h-9 w-28"
                    disabled={isPending || (!myMember && !isAdmin)}
                  />
                  <Button
                    disabled={isPending || !bidAmount || (!myMember && !isAdmin)}
                    onClick={() => submitBid(Number(bidAmount))}
                  >
                    {isPending && <Spinner className="mr-2" />}
                    Bid
                  </Button>
                  {[0, 4, 9].map((extra) => (
                    <Button
                      key={extra}
                      variant="outline"
                      size="sm"
                      disabled={isPending || (!myMember && !isAdmin)}
                      onClick={() => submitBid(minNextBid + extra * settings.minRaise)}
                    >
                      {fmtMoney(minNextBid + extra * settings.minRaise)}
                    </Button>
                  ))}
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <select
                      value={onBehalfId}
                      onChange={(e) => setOnBehalfId(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">Bid as yourself</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          Bid for {memberName(m.id)}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => hammerCalcuttaLot(tournament.id, poolId))}
                    >
                      <Gavel className="mr-1 h-4 w-4" />
                      {draftState?.lot_high_bid !== null && draftState?.lot_high_bid !== undefined
                        ? `Hammer at ${fmtMoney(draftState.lot_high_bid)}`
                        : 'Pass (no sale)'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              isAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={winnerId}
                    onChange={(e) => setWinnerId(e.target.value)}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">Select winner…</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {memberName(m.id)}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Price"
                    className="h-9 w-28"
                  />
                  <Button
                    disabled={isPending || !winnerId || !price}
                    onClick={() =>
                      run(async () => {
                        const result = await recordCalcuttaLotResult(
                          tournament.id,
                          poolId,
                          winnerId,
                          Number(price)
                        )
                        if (!result.error) {
                          setWinnerId('')
                          setPrice('')
                        }
                        return result
                      })
                    }
                  >
                    {isPending && <Spinner className="mr-2" />}
                    Sold
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isPending}
                    onClick={() => run(() => recordCalcuttaLotResult(tournament.id, poolId, null, null))}
                  >
                    No sale
                  </Button>
                </div>
              )
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {status === 'completed' && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="font-medium">Auction complete — pot {fmtMoney(pot)}</p>
            <Link
              href={`/pools/${poolId}/tournaments/${tournament.id}/standings`}
              className={`${buttonVariants({ variant: 'default' })} mt-3`}
            >
              View Standings
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Bid history */}
        {settings.mode === 'live' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bid History</CardTitle>
            </CardHeader>
            <CardContent>
              {bids.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bids yet.</p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                  {bids.map((b) => {
                    const lot = lots.find((l) => l.id === b.lot_id)
                    return (
                      <li key={b.id} className="flex justify-between gap-2">
                        <span className="truncate">
                          {memberName(b.member_id)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {lot?.label ?? ''}
                          </span>
                        </span>
                        <span className="font-medium tabular-nums">{fmtMoney(b.amount)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upcoming */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Up Next ({pendingLots.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingLots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lots remaining.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {pendingLots.map((lot) => (
                  <li key={lot.id}>
                    <span>{lot.label}</span>
                    {lot.kind === 'scraps' && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({lot.golfer_ids.length})
                      </span>
                    )}
                    {(() => {
                      const g = lot.kind === 'golfer' ? golferById.get(lot.golfer_ids[0]) : null
                      return g?.calcutta_odds ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          +{g.calcutta_odds}
                        </span>
                      ) : null
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sold ({soldLots.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {soldLots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing sold yet.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {soldLots.map((lot) => (
                  <li key={lot.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {lot.label}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {memberName(lot.winner_member_id)}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {lot.price !== null ? fmtMoney(lot.price) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div className="flex items-center gap-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => undoLastCalcuttaLot(tournament.id, poolId))}
          >
            Undo Last Lot
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm('Reset the entire auction? All bids and results will be erased.'))
                return
              run(() => resetCalcuttaAuction(tournament.id, poolId))
            }}
          >
            Reset Auction
          </Button>
        </div>
      )}
    </div>
  )
}
