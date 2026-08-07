import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentNflSeasonYear } from '@/lib/ff/settings'
import { currentWeek } from '@/lib/ff/refresh'
import { NflDataControls } from '@/components/admin/nfl-data-controls'
import { GameTime } from '@/components/schedule/game-time'

// Site-admin auth is enforced by the /admin layout
export default async function AdminNflDataPage() {
  const admin = createAdminClient()
  const seasonYear = currentNflSeasonYear()

  const resources = [
    { key: `ff_players:${seasonYear}`, label: 'Player catalog', cadence: 'lazy · 24h' },
    { key: `ff_schedule:${seasonYear}`, label: 'Season schedule', cadence: 'lazy · 24h' },
    { key: `ff_stats:${seasonYear}`, label: 'Scores & stats', cadence: 'lazy · 90s live / 5min' },
    { key: 'ff_rankings', label: 'Rankings & market data', cadence: 'manual only' },
  ]

  const [refreshRes, playersRes, gamesRes, statsRes] = await Promise.all([
    admin
      .from('data_refresh')
      .select('resource, last_refreshed_at')
      .in('resource', resources.map((r) => r.key)),
    admin.from('ff_players').select('id', { count: 'exact', head: true }).eq('active', true),
    admin
      .from('ff_nfl_games')
      .select('id, week, status, start_time')
      .eq('season_year', seasonYear)
      .eq('season_type', 2),
    admin
      .from('ff_player_stats')
      .select('player_id', { count: 'exact', head: true })
      .eq('season_year', seasonYear),
  ])

  const refreshedAt = new Map(
    (refreshRes.data ?? []).map((r) => [r.resource, r.last_refreshed_at as string | null])
  )
  const games = gamesRes.data ?? []
  const week = currentWeek(games) ?? 1

  const rowCounts: Record<string, string> = {
    [`ff_players:${seasonYear}`]: `${playersRes.count ?? 0} active players`,
    [`ff_schedule:${seasonYear}`]: `${games.length} games`,
    [`ff_stats:${seasonYear}`]: `${statsRes.count ?? 0} stat rows`,
    ff_rankings: '',
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Admin
      </Link>
      <div>
        <h1 className="text-2xl font-bold">NFL Data</h1>
        <p className="text-muted-foreground">
          {seasonYear} season · current week {week}. Data refreshes lazily on page reads;
          the triggers below force it now.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Freshness</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-2 py-2 font-normal">Resource</th>
                <th className="px-2 py-2 font-normal">Refresh policy</th>
                <th className="px-2 py-2 font-normal">Rows</th>
                <th className="px-2 py-2 text-right font-normal">Last refreshed</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => {
                const at = refreshedAt.get(r.key)
                const isEpoch = at != null && new Date(at).getFullYear() < 2000
                return (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="px-2 py-2 font-medium">{r.label}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.cadence}</td>
                    <td className="px-2 py-2 text-muted-foreground">{rowCounts[r.key]}</td>
                    <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                      {at && !isEpoch ? <GameTime startTime={at} /> : 'Never'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Refresh</CardTitle>
          <CardDescription>
            Each trigger makes live ESPN (or ranking-source) requests and stamps the
            freshness table. Week stats and backfills run one week per call.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NflDataControls seasonYear={seasonYear} currentWeek={week} />
        </CardContent>
      </Card>
    </div>
  )
}
