'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  cancelFfWaiverClaim,
  processFfWaiversNow,
  reorderFfWaiverClaims,
} from '@/lib/ff/waiver-actions'

export interface ClaimRow {
  id: string
  addName: string
  addPosition: string
  dropName: string | null
  bid: number
}

export interface WaiverOrderRow {
  memberId: string
  name: string
  priority: number
  faabRemaining: number
  isMe: boolean
}

export function WaiverClaimsPanel({
  poolId,
  waiversType,
  nextProcessAt,
  myClaims,
  order,
  isCommissioner,
}: {
  poolId: string
  waiversType: 'faab' | 'priority'
  nextProcessAt: string | null
  myClaims: ClaimRow[]
  order: WaiverOrderRow[]
  isCommissioner: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ error?: string }>) => {
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else {
        setError(null)
        router.refresh()
      }
    })
  }

  const move = (index: number, dir: -1 | 1) => {
    const ids = myClaims.map((c) => c.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    run(() => reorderFfWaiverClaims(poolId, ids))
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-baseline justify-between text-sm">
            <span>My waiver claims</span>
            {nextProcessAt && (
              <span className="text-xs font-normal text-muted-foreground">
                Processes {new Date(nextProcessAt).toLocaleString()}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {myClaims.map((c, i) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="mr-1 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                <span className="mr-1 font-semibold text-muted-foreground">{c.addPosition}</span>
                {c.addName}
                {c.dropName && (
                  <span className="text-xs text-muted-foreground"> (drop {c.dropName})</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                {waiversType === 'faab' && (
                  <span className="mr-1 font-mono text-xs tabular-nums">${c.bid}</span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  disabled={pending || i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  disabled={pending || i === myClaims.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  disabled={pending}
                  onClick={() => run(() => cancelFfWaiverClaim(poolId, c.id))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            </div>
          ))}
          {myClaims.length === 0 && (
            <p className="text-muted-foreground">No pending claims.</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {isCommissioner && (
            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (confirm('Process all pending waiver claims now?')) {
                    run(() => processFfWaiversNow(poolId))
                  }
                }}
              >
                {pending ? 'Processing…' : 'Process waivers now'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {waiversType === 'faab' ? 'FAAB budgets' : 'Waiver order'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {order.map((r) => (
            <div key={r.memberId} className="flex items-baseline justify-between gap-2">
              <span className={r.isMe ? 'font-semibold' : undefined}>
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                  {r.priority}.
                </span>
                {r.name}
              </span>
              {waiversType === 'faab' && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  ${r.faabRemaining}
                </span>
              )}
            </div>
          ))}
          {order.length === 0 && (
            <p className="text-muted-foreground">
              Waiver order is set when the draft completes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
