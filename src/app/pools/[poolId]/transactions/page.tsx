import { notFound } from 'next/navigation'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { getFfTransactions } from '@/lib/ff/queries'
import { Badge } from '@/components/ui/badge'
import type { FFTransaction } from '@/lib/ff/types'
import { GameTime } from '@/components/schedule/game-time'

const TYPE_LABELS: Record<FFTransaction['type'], string> = {
  free_agent_add: 'Free agent',
  drop: 'Drop',
  waiver_claim: 'Waiver',
  trade: 'Trade',
  commissioner: 'Commissioner',
}

function describe(t: FFTransaction): string {
  const parts: string[] = []
  if (t.detail.add) parts.push(`Added ${t.detail.add.position} ${t.detail.add.name}`)
  if (t.detail.bid !== undefined) parts.push(`for $${t.detail.bid}`)
  if (t.detail.drop) parts.push(`${t.detail.add ? '· dropped' : 'Dropped'} ${t.detail.drop.position} ${t.detail.drop.name}`)
  if (t.detail.note) parts.push(t.detail.note)
  return parts.join(' ') || '—'
}

export default async function TransactionsPage({
  params,
}: {
  params: Promise<{ poolId: string }>
}) {
  const { poolId } = await params
  const pool = await getPool(poolId)
  if (!pool || pool.game_type !== 'ff') notFound()

  const [transactions, members] = await Promise.all([
    getFfTransactions(poolId),
    getPoolMembers(poolId),
  ])
  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">Adds, drops, waivers, and trades.</p>
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {TYPE_LABELS[t.type]}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-medium">
                  {t.member_id ? (nameByMember.get(t.member_id) ?? '—') : '—'}
                </td>
                <td className="px-3 py-2">{describe(t)}</td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                  <GameTime startTime={t.created_at} />
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground">
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
