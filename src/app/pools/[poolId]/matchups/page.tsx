import { notFound, redirect } from 'next/navigation'
import { getPool } from '@/lib/pools/queries'
import { getFfCurrentWeek } from '@/lib/ff/queries'

export default async function MatchupsIndexPage({
  params,
}: {
  params: Promise<{ poolId: string }>
}) {
  const { poolId } = await params
  const pool = await getPool(poolId)
  if (!pool || pool.game_type !== 'ff') notFound()

  const week = await getFfCurrentWeek(pool.season_year)
  redirect(`/pools/${poolId}/matchups/${week}`)
}
