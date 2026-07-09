import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { getFfPlayersByIds, getFfTrades } from '@/lib/ff/queries'
import { resolveLeagueSettings } from '@/lib/ff/settings'
import { buttonVariants } from '@/components/ui/button'
import { TradeList, type TradeRow } from '@/components/ff/trade-list'

export default async function TradesPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, userId] = await Promise.all([getPool(poolId), getCurrentUserId()])
  if (!pool || pool.game_type !== 'ff') notFound()

  const settings = resolveLeagueSettings(pool)
  const [trades, members] = await Promise.all([getFfTrades(poolId), getPoolMembers(poolId)])
  const me = members.find((m) => m.user_id === userId)
  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))

  const playerIds = [
    ...new Set(trades.flatMap((t) => [...t.proposer_player_ids, ...t.recipient_player_ids])),
  ]
  const playersById = await getFfPlayersByIds(playerIds)
  const label = (id: string) => {
    const p = playersById.get(id)
    return p ? `${p.position} ${p.name}` : '—'
  }

  const rows: TradeRow[] = trades.map((t) => ({
    id: t.id,
    status: t.status,
    proposerName: nameByMember.get(t.proposer_member_id) ?? '—',
    recipientName: nameByMember.get(t.recipient_member_id) ?? '—',
    proposerSends: t.proposer_player_ids.map(label),
    recipientSends: t.recipient_player_ids.map(label),
    resolution: t.resolution,
    createdAt: t.created_at,
    iAmProposer: t.proposer_member_id === me?.id,
    iAmRecipient: t.recipient_member_id === me?.id,
  }))

  const canTrade = settings.trades.enabled && me && pool.draft_status === 'completed'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trades</h1>
          <p className="text-muted-foreground">
            {settings.trades.enabled
              ? settings.trades.deadlineWeek
                ? `Trade deadline: week ${settings.trades.deadlineWeek}`
                : 'No trade deadline'
              : 'Trades are disabled in this league.'}
          </p>
        </div>
        {canTrade && (
          <Link href={`/pools/${poolId}/trades/new`} className={buttonVariants()}>
            Propose trade
          </Link>
        )}
      </div>
      <TradeList poolId={poolId} trades={rows} isCommissioner={pool.admin_id === userId} />
    </div>
  )
}
