import { notFound } from 'next/navigation'
import { getPool, getCurrentUserId } from '@/lib/pools/queries'
import { getTournament, getTournamentMembers, getTournamentGolfers } from '@/lib/pga/queries'
import { PgaDraftRoom } from '@/components/pga/pga-draft-room'

export const revalidate = 60

export default async function PgaDraftPage({
  params,
}: {
  params: Promise<{ poolId: string; tournamentId: string }>
}) {
  const { poolId, tournamentId } = await params
  const [pool, tournament, members, golfers, userId] = await Promise.all([
    getPool(poolId),
    getTournament(tournamentId),
    getTournamentMembers(tournamentId),
    getTournamentGolfers(tournamentId),
    getCurrentUserId(),
  ])

  if (!pool || !tournament) notFound()

  return (
    <PgaDraftRoom
      tournament={tournament}
      poolId={poolId}
      members={members}
      golfers={golfers}
      currentUserId={userId!}
      isAdmin={pool.admin_id === userId}
    />
  )
}
