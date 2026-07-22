import { notFound, redirect } from 'next/navigation'
import { getPool } from '@/lib/pools/queries'
import { getBestBallCurrentWeek, getFfCurrentWeek } from '@/lib/ff/queries'
import { resolveBestBallSettings, resolveLeagueSettings } from '@/lib/ff/settings'
import { playoffRoundsCount } from '@/lib/ff/playoffs'
import { isFfFamily } from '@/lib/games/registry'

export default async function MatchupsIndexPage({
  params,
}: {
  params: Promise<{ poolId: string }>
}) {
  const { poolId } = await params
  const pool = await getPool(poolId)
  if (!pool || !isFfFamily(pool.game_type)) notFound()
  // Best ball total-points pools have no matchups
  if (pool.game_type === 'ff_bestball' && resolveBestBallSettings(pool).format !== 'h2h') {
    notFound()
  }

  const settings = resolveLeagueSettings(pool)
  const maxWeek = Math.max(
    settings.season.regularSeasonWeeks,
    settings.season.playoffStartWeek + playoffRoundsCount(settings.season.playoffTeams) - 1
  )
  const currentWeek =
    pool.game_type === 'ff_bestball'
      ? (await getBestBallCurrentWeek(pool.season_year, resolveBestBallSettings(pool))).currentWeek
      : await getFfCurrentWeek(pool.season_year)
  const week = Math.min(currentWeek, maxWeek)
  redirect(`/pools/${poolId}/matchups/${week}`)
}
