import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { notFound } from 'next/navigation'
import { DraftRoom } from '@/components/draft/draft-room'

export default async function DraftPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()

  return (
    <DraftRoom
      pool={pool}
      members={members}
      currentUserId={userId!}
    />
  )
}
