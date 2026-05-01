import { notFound } from 'next/navigation'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DraftPick, CachedGame, CachedTeam } from '@/lib/types'

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { poolId } = await params
  const { week: weekParam } = await searchParams
  const [pool, members] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
  ])

  if (!pool) notFound()

  const supabase = await createClient()

  // Get all draft picks and team data
  const [picksRes, teamsRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId),
    supabase.from('cached_teams').select('*').eq('season_year', pool.season_year),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const teams = (teamsRes.data ?? []) as CachedTeam[]

  // Build lookup: team_id -> member display name
  const teamToManager = new Map<string, string>()
  for (const pick of picks) {
    if (pick.member_id) {
      const member = members.find((m) => m.id === pick.member_id)
      if (member) {
        teamToManager.set(pick.team_id, member.profiles.display_name)
      }
    }
  }

  const draftedTeamIds = new Set(picks.map((p) => p.team_id))

  // Fetch games for selected week
  const selectedWeek = Number(weekParam) || 1
  const weeks = Array.from({ length: 15 }, (_, i) => i + 1)

  // Check cache first, if empty trigger a fetch from the data provider
  let { data: gamesData } = await supabase
    .from('cached_games')
    .select('*')
    .eq('season_year', pool.season_year)
    .eq('week', selectedWeek)

  if (!gamesData || gamesData.length === 0) {
    // Fetch from provider and populate cache
    try {
      const { getDataProvider } = await import('@/lib/data-providers')
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const provider = getDataProvider()
      const fetchedGames = await provider.getGamesForWeek(pool.season_year, selectedWeek)
      const admin = createAdminClient()

      const rows = fetchedGames.map((g) => ({
        id: g.id,
        season_year: g.seasonYear,
        week: g.week,
        home_team_id: g.homeTeam.id,
        away_team_id: g.awayTeam.id,
        home_score: g.homeTeam.score,
        away_score: g.awayTeam.score,
        status: g.status,
        start_time: g.startTime,
        venue: g.venue,
        fetched_at: new Date().toISOString(),
      }))

      if (rows.length > 0) {
        await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
      }

      gamesData = rows
    } catch {
      gamesData = []
    }
  }

  const games = (gamesData ?? []) as CachedGame[]

  // Filter games to only those involving drafted teams
  const relevantGames = games.filter(
    (g) => draftedTeamIds.has(g.home_team_id) || draftedTeamIds.has(g.away_team_id)
  )

  // Identify head-to-head matchups (both teams belong to different managers)
  const h2hGames = relevantGames.filter((g) => {
    const homeManager = teamToManager.get(g.home_team_id)
    const awayManager = teamToManager.get(g.away_team_id)
    return homeManager && awayManager && homeManager !== awayManager
  })

  const h2hGameIds = new Set(h2hGames.map((g) => g.id))

  const teamMap = new Map(teams.map((t) => [t.id, t]))

  if (pool.draft_status === 'pre_draft') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Schedule will be available after the draft is complete.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Schedule</h1>

      {/* Week selector */}
      <div className="flex flex-wrap gap-2">
        {weeks.map((w) => (
          <a
            key={w}
            href={`/pools/${poolId}/schedule?week=${w}`}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors ${
              w === selectedWeek
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {w}
          </a>
        ))}
      </div>

      <h2 className="text-lg font-semibold">Week {selectedWeek}</h2>

      {/* H2H matchups first */}
      {h2hGames.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-primary">Head-to-Head Matchups</h3>
          {h2hGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              teamMap={teamMap}
              teamToManager={teamToManager}
              isH2H={true}
            />
          ))}
        </div>
      )}

      {/* Other relevant games */}
      <div className="space-y-3">
        {h2hGames.length > 0 && relevantGames.length > h2hGames.length && (
          <h3 className="font-medium text-muted-foreground">Other Games</h3>
        )}
        {relevantGames
          .filter((g) => !h2hGameIds.has(g.id))
          .map((game) => (
            <GameCard
              key={game.id}
              game={game}
              teamMap={teamMap}
              teamToManager={teamToManager}
              isH2H={false}
            />
          ))}
      </div>

      {relevantGames.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No games found for week {selectedWeek}. Try syncing schedule data.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function GameCard({
  game,
  teamMap,
  teamToManager,
  isH2H,
}: {
  game: CachedGame
  teamMap: Map<string, CachedTeam>
  teamToManager: Map<string, string>
  isH2H: boolean
}) {
  const homeTeam = teamMap.get(game.home_team_id)
  const awayTeam = teamMap.get(game.away_team_id)
  const homeManager = teamToManager.get(game.home_team_id)
  const awayManager = teamToManager.get(game.away_team_id)

  return (
    <Card className={isH2H ? 'border-primary/50 bg-primary/5' : ''}>
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {awayTeam?.logo_url && (
              <img src={awayTeam.logo_url} alt="" className="h-6 w-6 object-contain" />
            )}
            <div>
              <span className="font-medium">{awayTeam?.name ?? game.away_team_id}</span>
              {awayManager && (
                <span className="ml-2 text-xs text-muted-foreground">({awayManager})</span>
              )}
            </div>
          </div>
          <span className="text-lg font-bold">{game.away_score ?? '—'}</span>
        </div>
        <div className="my-1 text-center text-xs text-muted-foreground">
          {game.status === 'final' ? 'Final' : '@'}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {homeTeam?.logo_url && (
              <img src={homeTeam.logo_url} alt="" className="h-6 w-6 object-contain" />
            )}
            <div>
              <span className="font-medium">{homeTeam?.name ?? game.home_team_id}</span>
              {homeManager && (
                <span className="ml-2 text-xs text-muted-foreground">({homeManager})</span>
              )}
            </div>
          </div>
          <span className="text-lg font-bold">{game.home_score ?? '—'}</span>
        </div>
        {isH2H && (
          <div className="mt-2 text-center">
            <Badge variant="default" className="text-xs">Head-to-Head</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
