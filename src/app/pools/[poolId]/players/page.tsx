import { notFound } from 'next/navigation'
import { getPool } from '@/lib/pools/queries'
import { getFfPlayers } from '@/lib/ff/queries'
import { PlayersBrowser } from '@/components/ff/players-browser'

export const revalidate = 60

export default async function PlayersPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const pool = await getPool(poolId)
  if (!pool || pool.game_type !== 'ff') notFound()

  const players = await getFfPlayers(pool.season_year)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Players</h1>
        <p className="text-muted-foreground">
          {players.length > 0
            ? `${players.length} active NFL players`
            : 'Player catalog is loading — check back in a moment.'}
        </p>
      </div>
      <PlayersBrowser players={players} />
    </div>
  )
}
