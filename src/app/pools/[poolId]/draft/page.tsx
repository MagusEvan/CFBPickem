import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { notFound } from 'next/navigation'
import { DraftRoom } from '@/components/draft/draft-room'
import { FfDraftRoom } from '@/components/ff/ff-draft-room'
import { DraftRecap } from '@/components/ff/draft-recap'
import {
  getFfDraftPicks,
  getFfDraftState,
  getFfPlayers,
  getFfPlayersByIds,
  getNflByeWeeks,
} from '@/lib/ff/queries'
import { draftRounds } from '@/lib/ff/draft-engine'
import { resolveLeagueSettings } from '@/lib/ff/settings'
import { isFfFamily } from '@/lib/games/registry'

export const revalidate = 60

export default async function DraftPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()

  if (isFfFamily(pool.game_type)) {
    const settings = resolveLeagueSettings(pool)

    // Completed drafts get a static server-rendered recap — no realtime
    // channel and no full-catalog payload
    const draftState = await getFfDraftState(poolId)
    if (draftState?.status === 'completed') {
      const [picks, byeWeeks] = await Promise.all([
        getFfDraftPicks(poolId),
        getNflByeWeeks(pool.season_year),
      ])
      const players = await getFfPlayersByIds(picks.map((p) => p.player_id))
      return (
        <DraftRecap
          pool={pool}
          members={members}
          picks={picks}
          players={[...players.values()]}
          settings={settings}
          rounds={draftRounds(settings)}
          isAdmin={pool.admin_id === userId}
          isAuction={draftState.draft_type === 'auction'}
          byeWeeks={byeWeeks}
        />
      )
    }

    const [players, byeWeeks] = await Promise.all([
      getFfPlayers(pool.season_year),
      getNflByeWeeks(pool.season_year),
    ])
    return (
      <FfDraftRoom
        pool={pool}
        members={members}
        players={players}
        byeWeeks={byeWeeks}
        settings={settings}
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
