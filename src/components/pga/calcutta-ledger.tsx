'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface LedgerGolferRow {
  name: string
  finishLabel: string
  scoreLabel: string
  payout: number
  lotLabel: string
  lotPrice: number | null
}

export interface LedgerManagerRow {
  memberId: string
  name: string
  spent: number
  won: number
  net: number
  golfers: LedgerGolferRow[]
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n)
  const s = Number.isInteger(abs) ? `$${abs}` : `$${abs.toFixed(2)}`
  return n < 0 ? `-${s}` : s
}

export function CalcuttaLedger({ pot, rows }: { pot: number; rows: LedgerManagerRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto py-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Pot: <span className="font-semibold text-foreground">{fmtMoney(pot)}</span>
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-2 py-2 text-left text-xs text-muted-foreground">Manager</th>
              <th className="px-2 py-2 text-right text-xs text-muted-foreground">Spent</th>
              <th className="px-2 py-2 text-right text-xs text-muted-foreground">Won</th>
              <th className="px-2 py-2 text-right text-xs text-muted-foreground">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ManagerRows
                key={row.memberId}
                row={row}
                expanded={expanded.has(row.memberId)}
                onToggle={() => toggle(row.memberId)}
              />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function ManagerRows({
  row,
  expanded,
  onToggle,
}: {
  row: LedgerManagerRow
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="cursor-pointer border-b hover:bg-muted/50" onClick={onToggle}>
        <td className="px-2 py-2">
          <span className="flex items-center gap-1 font-medium">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {row.name}
          </span>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(row.spent)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(row.won)}</td>
        <td
          className={`px-2 py-2 text-right font-semibold tabular-nums ${
            row.net > 0 ? 'text-green-700' : row.net < 0 ? 'text-destructive' : ''
          }`}
        >
          {fmtMoney(row.net)}
        </td>
      </tr>
      {expanded &&
        row.golfers.map((g, i) => (
          <tr key={i} className="border-b bg-muted/30 text-xs">
            <td className="py-1.5 pl-8 pr-2">
              {g.name}
              <span className="ml-2 text-muted-foreground">
                {g.finishLabel} · {g.scoreLabel} · {g.lotLabel}
              </span>
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
              {g.lotPrice !== null ? fmtMoney(g.lotPrice) : ''}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">
              {g.payout > 0 ? fmtMoney(g.payout) : '—'}
            </td>
            <td />
          </tr>
        ))}
    </>
  )
}
