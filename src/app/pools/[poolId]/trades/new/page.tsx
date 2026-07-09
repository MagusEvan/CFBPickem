import { notFound, redirect } from 'next/navigation'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { getFfPlayersByIds, getFfRosters } from '@/lib/ff/queries'
import { resolveLeagueSettings } from '@/lib/ff/settings'
import { TradeComposer, type TradePlayer } from '@/components/ff/trade-composer'

export default async function NewTradePage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, userId] = await Promise.all([getPool(poolId), getCurrentUserId()])
  if (!pool || pool.game_type !== 'ff') notFound()

  const settings = resolveLeagueSettings(pool)
  if (!settings.trades.enabled || pool.draft_status !== 'completed') {
    redirect(`/pools/${poolId}/trades`)
  }

  const [members, rosters] = await Promise.all([getPoolMembers(poolId), getFfRosters(poolId)])
  const me = members.find((m) => m.user_id === userId)
  if (!me) redirect(`/pools/${poolId}/trades`)

  const playersById = await getFfPlayersByIds(rosters.map((r) => r.player_id))
  const rostersByMember: Record<string, TradePlayer[]> = {}
  for (const r of rosters) {
    const p = playersById.get(r.player_id)
    if (!p) continue
    rostersByMember[r.member_id] = [
      ...(rostersByMember[r.member_id] ?? []),
      { id: p.id, name: p.name, position: p.position, team: p.nfl_team_abbrev },
    ]
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Propose a Trade</h1>
        <p className="text-muted-foreground">Select players from each side.</p>
      </div>
      <TradeComposer
        poolId={poolId}
        myMemberId={me.id}
        partners={members
          .filter((m) => m.id !== me.id)
          .map((m) => ({ memberId: m.id, name: m.profiles.display_name }))}
        rosters={rostersByMember}
      />
    </div>
  )
}
