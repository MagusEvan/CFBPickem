'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { PickTimer } from './pick-timer'
import type { FFPlayer, FFAuctionBid } from '@/lib/ff/types'

/**
 * The open auction lot: player up for bid, high bid, countdown (every bid
 * resets it), bid controls, and the live bid feed.
 */
export function AuctionLot({
  player,
  byeWeek,
  highBid,
  highBidderName,
  iAmHighBidder,
  deadline,
  myMaxBid,
  bids,
  nameByMember,
  pending,
  onBid,
  onExpire,
}: {
  player: FFPlayer
  /** Regular-season bye week of the player's team, if known */
  byeWeek: number | null
  highBid: number
  highBidderName: string
  iAmHighBidder: boolean
  deadline: string | null
  myMaxBid: number
  bids: FFAuctionBid[]
  nameByMember: Map<string, string>
  pending: boolean
  onBid: (amount: number) => void
  onExpire: () => void
}) {
  const [amount, setAmount] = useState('')

  const minRaise = highBid + 1
  const canBid = !iAmHighBidder && myMaxBid >= minRaise

  const submitCustom = () => {
    const n = Number.parseInt(amount, 10)
    if (Number.isInteger(n)) {
      onBid(n)
      setAmount('')
    }
  }

  const quickRaises = [1, 5, 10].filter((r) => highBid + r <= myMaxBid)

  return (
    <Card className="border-primary/50">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {player.headshot_url ? (
              <Image
                src={player.headshot_url}
                alt={player.name}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full bg-muted object-cover"
                unoptimized
              />
            ) : (
              <span className="h-12 w-12 rounded-full bg-muted" />
            )}
            <div>
              <p className="font-semibold">{player.name}</p>
              <p className="text-xs text-muted-foreground">
                {player.position} · {player.nfl_team_abbrev ?? 'FA'}
                {byeWeek != null && ` · Bye ${byeWeek}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold tabular-nums">${highBid}</p>
            <p className={`text-xs ${iAmHighBidder ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              {iAmHighBidder ? 'You' : highBidderName}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <PickTimer deadline={deadline} onExpire={onExpire} />
          <span className="text-xs text-muted-foreground">Your max: ${Math.max(0, myMaxBid)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {quickRaises.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === 1 ? 'default' : 'outline'}
              disabled={!canBid || pending}
              onClick={() => onBid(highBid + r)}
            >
              +${r} (${highBid + r})
            </Button>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={minRaise}
              max={myMaxBid}
              placeholder={`$${minRaise}+`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCustom()}
              className="h-8 w-24"
              disabled={!canBid || pending}
            />
            <Button size="sm" variant="outline" disabled={!canBid || pending || !amount} onClick={submitCustom}>
              Bid
            </Button>
          </div>
          {iAmHighBidder && (
            <span className="text-xs text-muted-foreground">You&apos;re the high bidder.</span>
          )}
          {!iAmHighBidder && myMaxBid < minRaise && (
            <span className="text-xs text-destructive">You can&apos;t afford to raise.</span>
          )}
        </div>

        {bids.length > 0 && (
          <div className="max-h-24 space-y-0.5 overflow-y-auto border-t pt-2 text-xs text-muted-foreground">
            {[...bids].reverse().map((b) => (
              <p key={b.id}>
                <span className="font-medium text-foreground">
                  {nameByMember.get(b.member_id) ?? '—'}
                </span>{' '}
                bid <span className="font-mono">${b.amount}</span>
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
