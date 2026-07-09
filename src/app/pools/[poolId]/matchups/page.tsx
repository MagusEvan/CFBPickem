import { notFound, redirect } from 'next/navigation'
import { getPool } from '@/lib/pools/queries'
import { getFfCurrentWeek } from '@/lib/ff/queries'
import { resolveLeagueSettings } from '@/lib/ff/settings'
import { playoffRoundsCount } from '@/lib/ff/playoffs'

export default async function MatchupsIndexPage({
  params,
}: {
  params: Promise<{ poolId: string }>
}) {
  const { poolId } = await params
  const pool = await getPool(poolId)
  if (!pool || pool.game_type !== 'ff') notFound()

  const settings = resolveLeagueSettings(pool)
  const maxWeek = Math.max(
    settings.season.regularSeasonWeeks,
    settings.season.playoffStartWeek + playoffRoundsCount(settings.season.playoffTeams) - 1
  )
  const week = Math.min(await getFfCurrentWeek(pool.season_year), maxWeek)
  redirect(`/pools/${poolId}/matchups/${week}`)
}
