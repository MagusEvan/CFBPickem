import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGame } from '@/lib/games/registry'
import { resolveBestBallSettings, bestBallSimulatedWeek } from '@/lib/ff/settings'
import { BestBallTestModeCard } from '@/components/ff/bestball-test-mode-card'
import type { Pool } from '@/lib/types'

const STATUS_LABEL: Record<Pool['draft_status'], string> = {
  pre_draft: 'Pre-Draft',
  in_progress: 'Drafting',
  completed: 'In Season',
}

// Site-admin auth is enforced by the /admin layout
export default async function AdminPoolsPage() {
  const admin = createAdminClient()

  const [poolsRes, membersRes, profilesRes] = await Promise.all([
    admin
      .from('pools')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    admin.from('pool_members').select('pool_id'),
    admin.from('profiles').select('id, display_name'),
  ])

  const pools = (poolsRes.data ?? []) as Pool[]
  const memberCounts = new Map<string, number>()
  for (const m of membersRes.data ?? []) {
    memberCounts.set(m.pool_id, (memberCounts.get(m.pool_id) ?? 0) + 1)
  }
  const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id, p.display_name]))

  const bestBallPools = pools.filter((p) => p.game_type === 'ff_bestball')

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Admin
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Pools ({pools.length})</h1>
        <p className="text-muted-foreground">
          Every pool on the site. Pool pages themselves are member-only — the links below
          404 unless you have joined that pool.
        </p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-2 py-2 font-normal">Pool</th>
                <th className="px-2 py-2 font-normal">Game</th>
                <th className="px-2 py-2 font-normal">Season</th>
                <th className="px-2 py-2 font-normal">Status</th>
                <th className="px-2 py-2 text-center font-normal">Managers</th>
                <th className="px-2 py-2 font-normal">Commissioner</th>
                <th className="px-2 py-2 text-right font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-2 py-2">
                    <Link
                      href={`/pools/${p.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {getGame(p.game_type).name}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{p.season_year}</td>
                  <td className="px-2 py-2">
                    <Badge
                      variant={p.draft_status === 'completed' ? 'secondary' : 'outline'}
                      className="text-[10px]"
                    >
                      {STATUS_LABEL[p.draft_status]}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">
                    {memberCounts.get(p.id) ?? 0}/{p.max_managers}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {nameById.get(p.admin_id) ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {pools.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-8 text-center text-muted-foreground">
                    No pools yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {bestBallPools.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Best Ball Test Mode</h2>
            <p className="text-sm text-muted-foreground">
              Season-replay controls per best ball pool (also available on each pool&apos;s
              settings page).
            </p>
          </div>
          {bestBallPools.map((p) => (
            <details key={p.id} className="rounded-md border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted/50">
                {p.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {p.season_year} ·{' '}
                  {bestBallSimulatedWeek(resolveBestBallSettings(p)) !== null
                    ? `simulated week ${bestBallSimulatedWeek(resolveBestBallSettings(p))}`
                    : 'test mode off'}
                </span>
              </summary>
              <div className="border-t p-4">
                <BestBallTestModeCard
                  poolId={p.id}
                  seasonYear={p.season_year}
                  initialWeek={bestBallSimulatedWeek(resolveBestBallSettings(p))}
                />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
