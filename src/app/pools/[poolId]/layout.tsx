import { getPool } from '@/lib/pools/queries'
import { isFfFamily } from '@/lib/games/registry'
import { resolveLeagueSettings, resolveBestBallSettings } from '@/lib/ff/settings'
import { LeagueNav, type LeagueNavTab } from '@/components/ff/league-nav'

/**
 * Pool-scoped layout. FF-family pools get a league tab bar; every other game
 * type renders unchanged. Also wraps /tournaments/** (PGA), which is why the
 * non-FF path must stay a pure passthrough.
 */
export default async function PoolLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ poolId: string }>
}) {
  const { poolId } = await params
  const pool = await getPool(poolId)

  if (!pool) return <>{children}</>

  const base = `/pools/${pool.id}`
  const drafted = pool.draft_status === 'completed'

  let tabs: LeagueNavTab[]

  if (isFfFamily(pool.game_type)) {
    const isBestBall = pool.game_type === 'ff_bestball'
    const showMatchups = !isBestBall || resolveBestBallSettings(pool).format === 'h2h'
    const showTrades =
      !isBestBall && drafted && resolveLeagueSettings(pool).trades.enabled

    tabs = [
      { href: base, label: 'Home' },
      ...(drafted ? [{ href: `${base}/team`, label: 'My Team' }] : []),
      ...(drafted && showMatchups ? [{ href: `${base}/matchups`, label: 'Matchups' }] : []),
      ...(drafted ? [{ href: `${base}/standings`, label: 'Standings' }] : []),
      { href: `${base}/players`, label: 'Players' },
      ...(!isBestBall && drafted ? [{ href: `${base}/transactions`, label: 'Transactions' }] : []),
      ...(showTrades ? [{ href: `${base}/trades`, label: 'Trades' }] : []),
      {
        href: `${base}/draft`,
        label: 'Draft',
        live: pool.draft_status === 'in_progress',
      },
      { href: `${base}/settings`, label: 'Settings' },
    ]
  } else {
    // CFB, World Cup, PGA
    tabs = [
      { href: base, label: 'Home' },
      ...(drafted ? [{ href: `${base}/standings`, label: 'Standings' }] : []),
      ...(drafted ? [{ href: `${base}/schedule`, label: 'Schedule' }] : []),
      {
        href: `${base}/draft`,
        label: 'Draft',
        live: pool.draft_status === 'in_progress',
      },
      { href: `${base}/settings`, label: 'Settings' },
    ]
  }

  return (
    <>
      <LeagueNav poolId={pool.id} tabs={tabs} />
      {children}
    </>
  )
}
