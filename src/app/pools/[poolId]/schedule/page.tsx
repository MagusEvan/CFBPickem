import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DraftPick, CachedGame, CachedTeam, WcScrapsTeam } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter: 'Quarterfinals',
  semi: 'Semifinals',
  third_place: 'Third Place',
  final: 'Final',
}

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter', 'semi', 'third_place', 'final']

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>
  searchParams: Promise<{ week?: string; stage?: string }>
}) {
  const { poolId } = await params
  const { week: weekParam, stage: stageParam } = await searchParams
  const [pool, members] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
  ])

  if (!pool) notFound()

  if (pool.draft_status === 'pre_draft') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Schedule</h1>
          <Link href={`/pools/${poolId}`} className="text-sm text-muted-foreground hover:text-foreground">
            Return to Pool
          </Link>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Schedule will be available after the draft is complete.
          </CardContent>
        </Card>
      </div>
    )
  }

  const supabase = await createClient()

  // Get all draft picks, team data, and WC scraps
  const [picksRes, teamsRes, wcScrapsRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId),
    supabase
      .from('cached_teams')
      .select('*')
      .eq('season_year', pool.season_year)
      .eq('game_type', pool.game_type),
    pool.game_type === 'world_cup'
      ? supabase.from('wc_scraps_teams').select('*').eq('pool_id', poolId)
      : Promise.resolve({ data: null }),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const teams = (teamsRes.data ?? []) as CachedTeam[]
  const wcScraps = (wcScrapsRes.data ?? []) as WcScrapsTeam[]

  // Build lookup: team_id -> manager/scraps display name
  const teamToManager = new Map<string, string>()
  for (const pick of picks) {
    if (pick.member_id) {
      const member = members.find((m) => m.id === pick.member_id)
      if (member) {
        teamToManager.set(pick.team_id, member.profiles.display_name)
      }
    }
  }
  for (const scrap of wcScraps) {
    teamToManager.set(scrap.team_id, `Scraps Team ${scrap.scraps_team_number}`)
  }

  const draftedTeamIds = new Set([
    ...picks.map((p) => p.team_id),
    ...wcScraps.map((s) => s.team_id),
  ])
  const teamMap = new Map(teams.map((t) => [t.id, t]))

  if (pool.game_type === 'world_cup') {
    return (
      <WorldCupSchedule
        poolId={poolId}
        pool={pool}
        teamMap={teamMap}
        teamToManager={teamToManager}
        draftedTeamIds={draftedTeamIds}
        selectedStage={stageParam || 'group'}
      />
    )
  }

  // CFB schedule (existing logic)
  const selectedWeek = Number(weekParam) || 1
  const weeks = Array.from({ length: 15 }, (_, i) => i + 1)

  let { data: gamesData } = await supabase
    .from('cached_games')
    .select('*')
    .eq('season_year', pool.season_year)
    .eq('week', selectedWeek)

  if (!gamesData || gamesData.length === 0) {
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

  const relevantGames = games.filter(
    (g) => draftedTeamIds.has(g.home_team_id) || draftedTeamIds.has(g.away_team_id)
  )

  const h2hGames = relevantGames.filter((g) => {
    const homeManager = teamToManager.get(g.home_team_id)
    const awayManager = teamToManager.get(g.away_team_id)
    return homeManager && awayManager && homeManager !== awayManager
  })

  const h2hGameIds = new Set(h2hGames.map((g) => g.id))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Schedule</h1>

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

async function WorldCupSchedule({
  poolId,
  pool,
  teamMap,
  teamToManager,
  draftedTeamIds,
  selectedStage,
}: {
  poolId: string
  pool: { season_year: number }
  teamMap: Map<string, CachedTeam>
  teamToManager: Map<string, string>
  draftedTeamIds: Set<string>
  selectedStage: string
}) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: gamesData } = await supabase
    .from('cached_games')
    .select('*')
    .eq('game_type', 'world_cup')
    .eq('season_year', pool.season_year)

  const allGames = (gamesData ?? []) as CachedGame[]

  // Group games by stage
  const gamesByStage = new Map<string, CachedGame[]>()
  for (const game of allGames) {
    const stage = game.stage ?? 'group'
    if (!gamesByStage.has(stage)) gamesByStage.set(stage, [])
    gamesByStage.get(stage)!.push(game)
  }

  const stageGames = gamesByStage.get(selectedStage) ?? []

  // Filter to relevant games (involving drafted teams)
  const relevantGames = stageGames.filter(
    (g) => draftedTeamIds.has(g.home_team_id) || draftedTeamIds.has(g.away_team_id)
  )

  const h2hGames = relevantGames.filter((g) => {
    const homeManager = teamToManager.get(g.home_team_id)
    const awayManager = teamToManager.get(g.away_team_id)
    return homeManager && awayManager && homeManager !== awayManager
  })

  const h2hGameIds = new Set(h2hGames.map((g) => g.id))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Schedule</h1>

      {/* Stage selector */}
      <div className="flex flex-wrap gap-2">
        {STAGE_ORDER.map((stage) => {
          const count = gamesByStage.get(stage)?.length ?? 0
          return (
            <a
              key={stage}
              href={`/pools/${poolId}/schedule?stage=${stage}`}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                stage === selectedStage
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {STAGE_LABELS[stage] ?? stage}
              {count > 0 && (
                <span className="ml-1 text-xs opacity-70">({count})</span>
              )}
            </a>
          )
        })}
      </div>

      <h2 className="text-lg font-semibold">{STAGE_LABELS[selectedStage] ?? selectedStage}</h2>

      {h2hGames.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-primary">Head-to-Head Matchups</h3>
          {h2hGames.map((game) => (
            <WcGameCard
              key={game.id}
              game={game}
              teamMap={teamMap}
              teamToManager={teamToManager}
              isH2H={true}
            />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {h2hGames.length > 0 && relevantGames.length > h2hGames.length && (
          <h3 className="font-medium text-muted-foreground">Other Games</h3>
        )}
        {relevantGames
          .filter((g) => !h2hGameIds.has(g.id))
          .map((game) => (
            <WcGameCard
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
            No games involving your drafted teams in this stage yet.
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

function WcGameCard({
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

  let statusText = 'vs'
  if (game.status === 'final') {
    if (game.is_shootout) statusText = 'Final (Penalties)'
    else if (game.is_overtime) statusText = 'Final (AET)'
    else statusText = 'Final'
  } else if (game.status === 'in_progress') {
    statusText = 'Live'
  }

  return (
    <Card className={isH2H ? 'border-primary/50 bg-primary/5' : ''}>
      <CardContent className="py-3">
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
        <div className="my-1 text-center text-xs text-muted-foreground">
          {statusText}
          {game.is_shootout && game.status === 'final' && (
            <span className="ml-1">
              ({game.home_penalty_score} - {game.away_penalty_score})
            </span>
          )}
        </div>
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
        {isH2H && (
          <div className="mt-2 text-center">
            <Badge variant="default" className="text-xs">Head-to-Head</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
