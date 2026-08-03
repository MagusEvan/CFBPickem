'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ArrowDown, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { setDraftOrderMode, saveDraftOrder } from '@/lib/pools/draft-order-actions'

export interface DraftOrderMember {
  id: string
  displayName: string
}

export function DraftOrderCard({
  poolId,
  initialMode,
  members,
}: {
  poolId: string
  initialMode: 'manual' | 'random'
  /** Already in current draft order (see getPoolMembers) */
  members: DraftOrderMember[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState(initialMode)
  const [order, setOrder] = useState(members)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function changeMode(next: 'manual' | 'random') {
    if (next === mode) return
    setError(null)
    setSaved(false)
    setMode(next)
    startTransition(async () => {
      const result = await setDraftOrderMode(poolId, next)
      if (result.error) {
        setError(result.error)
        setMode(mode)
        return
      }
      setDirty(false)
      router.refresh()
    })
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    setDirty(true)
    setSaved(false)
  }

  function shuffle() {
    const next = [...order]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    setOrder(next)
    setDirty(true)
    setSaved(false)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await saveDraftOrder(
        poolId,
        order.map((m) => m.id)
      )
      if (result.error) {
        setError(result.error)
        return
      }
      setDirty(false)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft Order</CardTitle>
        <CardDescription>
          Can be changed any time before the draft starts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Order Mode</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="draft_order_mode"
                value="random"
                checked={mode === 'random'}
                onChange={() => changeMode('random')}
                disabled={isPending}
              />
              <span className="text-sm">Random</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="draft_order_mode"
                value="manual"
                checked={mode === 'manual'}
                onChange={() => changeMode('manual')}
                disabled={isPending}
              />
              <span className="text-sm">Manual</span>
            </label>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {mode === 'random' ? (
          <p className="text-sm text-muted-foreground">
            Positions are drawn at random when you start the draft. Switch to Manual to set
            them yourself.
          </p>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-2">
              {order.map((member, index) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-md border border-border p-2"
                >
                  <span className="w-6 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate text-sm">{member.displayName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${member.displayName} up`}
                    disabled={index === 0 || isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${member.displayName} down`}
                    disabled={index === order.length - 1 || isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" onClick={shuffle} disabled={isPending}>
              <Shuffle className="mr-2 size-4" />
              Shuffle
            </Button>
          </div>
        )}
      </CardContent>
      {mode === 'manual' && (
        <CardFooter className="gap-3">
          <Button type="button" onClick={save} disabled={!dirty || isPending}>
            {isPending && <Spinner className="mr-2" />}
            Save Draft Order
          </Button>
          {saved && !dirty && (
            <span className="text-sm text-muted-foreground">Saved</span>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
