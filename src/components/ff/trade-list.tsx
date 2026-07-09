'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cancelFfTrade, respondToFfTrade, reviewFfTrade } from '@/lib/ff/trade-actions'
import type { FFTradeStatus } from '@/lib/ff/types'

export interface TradeRow {
  id: string
  status: FFTradeStatus
  proposerName: string
  recipientName: string
  /** "POS Name" strings each side sends */
  proposerSends: string[]
  recipientSends: string[]
  resolution: string | null
  createdAt: string
  iAmProposer: boolean
  iAmRecipient: boolean
}

const STATUS_LABELS: Record<FFTradeStatus, string> = {
  proposed: 'Pending',
  accepted: 'Awaiting review',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  vetoed: 'Vetoed',
  executed: 'Completed',
}

export function TradeList({
  poolId,
  trades,
  isCommissioner,
}: {
  poolId: string
  trades: TradeRow[]
  isCommissioner: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const run = (tradeId: string, action: () => Promise<{ error?: string }>) => {
    setPendingId(tradeId)
    startTransition(async () => {
      const result = await action()
      setPendingId(null)
      if (result.error) setError(result.error)
      else {
        setError(null)
        router.refresh()
      }
    })
  }

  if (trades.length === 0) {
    return <p className="text-sm text-muted-foreground">No trades yet.</p>
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {trades.map((t) => {
        const pending = pendingId === t.id
        const open = t.status === 'proposed'
        return (
          <Card key={t.id}>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {t.proposerName} ⇄ {t.recipientName}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <Badge
                    variant={
                      t.status === 'executed'
                        ? 'default'
                        : open || t.status === 'accepted'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {STATUS_LABELS[t.status]}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t.proposerName} sends</p>
                  {t.proposerSends.map((s) => (
                    <p key={s}>{s}</p>
                  ))}
                  {t.proposerSends.length === 0 && <p className="text-muted-foreground">Nothing</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.recipientName} sends</p>
                  {t.recipientSends.map((s) => (
                    <p key={s}>{s}</p>
                  ))}
                  {t.recipientSends.length === 0 && <p className="text-muted-foreground">Nothing</p>}
                </div>
              </div>

              {t.resolution && (
                <p className="text-xs text-muted-foreground">{t.resolution}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {open && t.iAmRecipient && (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(t.id, () => respondToFfTrade(poolId, t.id, true))}
                    >
                      {pending ? 'Working…' : 'Accept'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(t.id, () => respondToFfTrade(poolId, t.id, false))}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {open && t.iAmProposer && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(t.id, () => cancelFfTrade(poolId, t.id))}
                  >
                    {pending ? 'Working…' : 'Cancel'}
                  </Button>
                )}
                {t.status === 'accepted' && isCommissioner && (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(t.id, () => reviewFfTrade(poolId, t.id, true))}
                    >
                      {pending ? 'Working…' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => {
                        if (confirm('Veto this trade?')) {
                          run(t.id, () => reviewFfTrade(poolId, t.id, false))
                        }
                      }}
                    >
                      Veto
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
