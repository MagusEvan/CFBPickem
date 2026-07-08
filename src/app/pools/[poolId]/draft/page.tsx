import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { notFound } from 'next/navigation'
import { DraftRoom } from '@/components/draft/draft-room'
import { FfDraftRoom } from '@/components/ff/ff-draft-room'
import { getFfPlayers } from '@/lib/ff/queries'
import { resolveLeagueSettings } from '@/lib/ff/settings'

export const revalidate = 60

export default async function DraftPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()

  if (pool.game_type === 'ff') {
    const players = await getFfPlayers(pool.season_year)
    return (
      <FfDraftRoom
        pool={pool}
        members={members}
        players={players}
        settings={resolveLeagueSettings(pool)}
        currentUserId={userId!}
      />
    )
  }

  return (
    <DraftRoom
      pool={pool}
      members={members}
      currentUserId={userId!}
    />
  )
}
