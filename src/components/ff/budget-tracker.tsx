import { cn } from '@/lib/utils'

export interface BudgetRow {
  memberId: string
  name: string
  spent: number
  budget: number
  openSpots: number
  maxBid: number
  isNominating: boolean
  isMe: boolean
}

/** Per-manager auction budgets: remaining, max bid, open roster spots. */
export function BudgetTracker({ rows }: { rows: BudgetRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-3 py-1.5 text-left font-medium">Manager</th>
            <th className="px-2 py-1.5 text-right font-medium">Left</th>
            <th className="px-2 py-1.5 text-right font-medium">Max</th>
            <th className="px-3 py-1.5 text-right font-medium">Spots</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.memberId} className="border-b last:border-0">
              <td className={cn('px-3 py-1.5', r.isMe && 'font-semibold')}>
                {r.name}
                {r.isNominating && <span className="ml-1.5 text-xs text-primary">nominating</span>}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                ${r.budget - r.spent}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                ${Math.max(0, r.maxBid)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                {r.openSpots}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
