'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { proposeFfTrade } from '@/lib/ff/trade-actions'
import { cn } from '@/lib/utils'

export interface TradePlayer {
  id: string
  name: string
  position: string
  team: string | null
}

export function TradeComposer({
  poolId,
  partners,
  rosters,
  myMemberId,
}: {
  poolId: string
  partners: Array<{ memberId: string; name: string }>
  /** memberId -> roster players (includes the caller's own) */
  rosters: Record<string, TradePlayer[]>
  myMemberId: string
}) {
  const router = useRouter()
  const [partnerId, setPartnerId] = useState(partners[0]?.memberId ?? '')
  const [give, setGive] = useState<Set<string>>(new Set())
  const [receive, setReceive] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const myRoster = rosters[myMemberId] ?? []
  const theirRoster = useMemo(() => rosters[partnerId] ?? [], [rosters, partnerId])

  const toggle = (set: Set<string>, update: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update(next)
  }

  const submit = () => {
    startTransition(async () => {
      const result = await proposeFfTrade(poolId, partnerId, [...give], [...receive])
      if (result.error) setError(result.error)
      else router.push(`/pools/${poolId}/trades`)
    })
  }

  const rosterColumn = (
    title: string,
    players: TradePlayer[],
    selected: Set<string>,
    onToggle: (id: string) => void
  ) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 space-y-0.5 overflow-y-auto text-sm">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/50',
              selected.has(p.id) && 'bg-primary/10 ring-1 ring-primary/40'
            )}
          >
            <span className="w-8 shrink-0 text-xs font-semibold text-muted-foreground">
              {p.position}
            </span>
            <span className="min-w-0 truncate">{p.name}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {p.team ?? 'FA'}
            </span>
          </button>
        ))}
        {players.length === 0 && <p className="text-muted-foreground">No players.</p>}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        Trade with
        <select
          className="h-9 rounded-md border bg-background px-2"
          value={partnerId}
          onChange={(e) => {
            setPartnerId(e.target.value)
            setReceive(new Set())
          }}
          disabled={pending}
        >
          {partners.map((p) => (
            <option key={p.memberId} value={p.memberId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        {rosterColumn('You send', myRoster, give, (id) => toggle(give, setGive, id))}
        {rosterColumn('You receive', theirRoster, receive, (id) => toggle(receive, setReceive, id))}
      </div>

      <div className="flex items-center gap-3">
        <Button
          disabled={pending || !partnerId || give.size + receive.size === 0}
          onClick={submit}
        >
          {pending ? 'Proposing…' : `Propose trade (${give.size} for ${receive.size})`}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  )
}
