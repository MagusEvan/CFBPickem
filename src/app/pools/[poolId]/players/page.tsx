import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import {
  getBestBallCurrentWeek,
  getFfCurrentWeek,
  getFfPlayers,
  getFfPlayersByIds,
  getFfPlayerWaivers,
  getFfRosters,
  getFfSeasonTotals,
  getFfWaiverClaims,
  getFfWaiverPriority,
  getFfWaiverState,
  type FFSeasonTotals,
} from '@/lib/ff/queries'
import {
  resolveBestBallSettings,
  resolveLeagueSettings,
  resolveScoringSettings,
  totalRosterSpots,
} from '@/lib/ff/settings'
import { isFfFamily } from '@/lib/games/registry'
import { maybeProcessWaivers } from '@/lib/ff/waiver-processing'
import { PlayersBrowser, type PlayersTransactionContext } from '@/components/ff/players-browser'
import { WaiverClaimsPanel } from '@/components/ff/waiver-claims-panel'
import { WaiverResultsCard, type ResolvedClaimRow } from '@/components/ff/waiver-results-card'

export default async function PlayersPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, userId] = await Promise.all([getPool(poolId), getCurrentUserId()])
  if (!pool || !isFfFamily(pool.game_type)) notFound()

  const players = await getFfPlayers(pool.season_year)

  // Season point totals once games have been played (pre-draft they're all 0)
  let seasonTotals: Record<string, FFSeasonTotals> | undefined
  if (pool.draft_status === 'completed') {
    const scoring = resolveScoringSettings(pool)
    const currentWeek =
      pool.game_type === 'ff_bestball'
        ? (await getBestBallCurrentWeek(pool.season_year, resolveBestBallSettings(pool))).currentWeek
        : await getFfCurrentWeek(pool.season_year)
    seasonTotals = Object.fromEntries(
      await getFfSeasonTotals(pool.season_year, scoring, currentWeek)
    )
  }

  const header = (
    <div>
      <h1 className="text-2xl font-bold">Players</h1>
      <p className="text-muted-foreground">
        {players.length > 0
          ? `${players.length} active NFL players`
          : 'Player catalog is loading — check back in a moment.'}
      </p>
    </div>
  )

  // Best ball rosters never change after the draft — read-only browse, no
  // waivers or transactions
  if (pool.draft_status !== 'completed' || pool.game_type === 'ff_bestball') {
    return (
      <div className="space-y-4">
        {header}
        <PlayersBrowser players={players} poolId={poolId} seasonTotals={seasonTotals} />
      </div>
    )
  }

  const settings = resolveLeagueSettings(pool)

  // Lazily process due waiver claims before reading rosters
  await maybeProcessWaivers(createAdminClient(), pool, settings)

  const [members, rosters, waiverState, priority, claims, playerWaivers] = await Promise.all([
    getPoolMembers(poolId),
    getFfRosters(poolId),
    getFfWaiverState(poolId),
    getFfWaiverPriority(poolId),
    getFfWaiverClaims(poolId),
    getFfPlayerWaivers(poolId),
  ])

  const me = members.find((m) => m.user_id === userId)
  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))

  const ownerByPlayer: Record<string, string> = {}
  for (const r of rosters) ownerByPlayer[r.player_id] = nameByMember.get(r.member_id) ?? '—'

  const myRosterIds = me ? rosters.filter((r) => r.member_id === me.id).map((r) => r.player_id) : []
  const myPendingClaims = me
    ? claims.filter((c) => c.member_id === me.id && c.status === 'pending')
    : []
  const resolvedClaims = claims.filter(
    (c) => c.status === 'won' || c.status === 'lost' || c.status === 'invalid'
  )
  const claimPlayerIds = [...myPendingClaims, ...resolvedClaims].flatMap((c) =>
    [c.add_player_id, c.drop_player_id].filter((id): id is string => id !== null)
  )
  const playersById = await getFfPlayersByIds([...new Set([...myRosterIds, ...claimPlayerIds])])

  const waiverResultRows: ResolvedClaimRow[] = resolvedClaims.map((claim) => ({
    claim,
    managerName: nameByMember.get(claim.member_id) ?? '—',
    addName: playersById.get(claim.add_player_id)?.name ?? '—',
    dropName: claim.drop_player_id
      ? playersById.get(claim.drop_player_id)?.name ?? null
      : null,
  }))

  const faabRemainingFor = (memberId: string) =>
    settings.waivers.faabBudget -
    (priority.find((p) => p.member_id === memberId)?.faab_spent ?? 0)

  const tx: PlayersTransactionContext | undefined = me
    ? {
        poolId,
        ownerByPlayer,
        myPlayerIds: myRosterIds,
        waiverLockedIds: [...playerWaivers.keys()],
        waiversType: settings.waivers.type,
        faabRemaining: faabRemainingFor(me.id),
        rosterFull: myRosterIds.length >= totalRosterSpots(settings),
        myRoster: myRosterIds
          .map((id) => playersById.get(id))
          .filter((p) => p !== undefined)
          .map((p) => ({ id: p.id, name: p.name, position: p.position })),
      }
    : undefined

  return (
    <div className="space-y-4">
      {header}
      {me && settings.waivers.type !== 'none' && (
        <WaiverClaimsPanel
          poolId={poolId}
          waiversType={settings.waivers.type}
          nextProcessAt={waiverState?.next_process_at ?? null}
          myClaims={myPendingClaims.map((c) => {
            const add = playersById.get(c.add_player_id)
            const drop = c.drop_player_id ? playersById.get(c.drop_player_id) : null
            return {
              id: c.id,
              addName: add?.name ?? '—',
              addPosition: add?.position ?? '',
              dropName: drop?.name ?? null,
              bid: c.bid,
            }
          })}
          order={priority.map((p) => ({
            memberId: p.member_id,
            name: nameByMember.get(p.member_id) ?? '—',
            priority: p.priority,
            faabRemaining: faabRemainingFor(p.member_id),
            isMe: p.member_id === me.id,
          }))}
          isCommissioner={pool.admin_id === userId}
        />
      )}
      <WaiverResultsCard rows={waiverResultRows} maxRuns={3} />
      <PlayersBrowser players={players} tx={tx} poolId={poolId} seasonTotals={seasonTotals} />
    </div>
  )
}
