import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import type { DraftPick, CachedGame, CachedTeam, WcScrapsTeam, WorldCupScoringConfig } from '@/lib/types'
import { scoreWorldCupGame } from '@/lib/scoring/strategies/world-cup'
import { getBroadcastForLocale } from '@/lib/broadcasts'
import { GameTime } from '@/components/schedule/game-time'
import { ScheduleHeader } from '@/components/schedule/refresh-schedule'
import { MyTeamsToggle } from '@/components/schedule/my-teams-toggle'
import { refreshSchedule } from '@/lib/schedule/actions'

export const revalidate = 60

const DEFAULT_WC_SCORING: WorldCupScoringConfig = {
  group: { win: 6, draw: 3, goal_points: 1, goal_cap: 3, shutout: 1 },
  knockout: {
    win: 6, ot_win: 5, shootout_win: 4, shootout_loss: 2,
    ot_loss: 1, loss: 0, goal_points: 1, goal_cap: null, shutout: 1,
  },
}

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

function sortByTime<T extends { start_time: string | null }>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    if (!a.start_time && !b.start_time) return 0
    if (!a.start_time) return 1
    if (!b.start_time) return -1
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  })
}

function isToday(startTime: string | null, tz: string): boolean {
  if (!startTime) return false
  const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz })
  return fmt(new Date(startTime)) === fmt(new Date())
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>
  searchParams: Promise<{ week?: string; stage?: string; mine?: string }>
}) {
  const { poolId } = await params
  const { week: weekParam, stage: stageParam, mine: mineParam } = await searchParams
  const mineOnly = mineParam === 'true'
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()

  const isAdmin = userId === pool.admin_id
  const cookieStore = await cookies()
  const userTz = cookieStore.get('tz')?.value || 'America/Chicago'

  if (pool.draft_status === 'pre_draft') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <Link href={`/pools/${poolId}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Pool
        </Link>
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

  // Build lookups: team_id -> manager name, team_id -> draft round
  const teamToManager = new Map<string, string>()
  const teamToRound = new Map<string, number>()
  for (const pick of picks) {
    teamToRound.set(pick.team_id, pick.round)
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

  // Current user's teams for "my teams only" filter
  const myMember = members.find((m) => m.user_id === userId)
  const myTeamIds = new Set(
    picks.filter((p) => p.member_id === myMember?.id).map((p) => p.team_id)
  )
  const teamMap = new Map(teams.map((t) => [t.id, t]))

  if (pool.game_type === 'world_cup') {
    return (
      <WorldCupSchedule
        poolId={poolId}
        pool={pool}
        teamMap={teamMap}
        teamToManager={teamToManager}
        teamToRound={teamToRound}
        draftedTeamIds={draftedTeamIds}
        selectedStage={stageParam || 'group'}
        scoringConfig={pool.scoring_config ?? DEFAULT_WC_SCORING}
        isAdmin={isAdmin}
        userTz={userTz}
        mineOnly={mineOnly}
        myTeamIds={myTeamIds}
      />
    )
  }

  // CFB schedule (existing logic)
  const selectedWeek = Number(weekParam) || 1
  const weeks = Array.from({ length: 15 }, (_, i) => i + 1)

  const { data: gamesData } = await supabase
    .from('cached_games')
    .select('*')
    .eq('season_year', pool.season_year)
    .eq('week', selectedWeek)

  const games = (gamesData ?? []) as CachedGame[]
  const cfbLastFetched = games.length > 0
    ? games.reduce((latest, g) => g.fetched_at > latest ? g.fetched_at : latest, games[0].fetched_at)
    : null

  const filterIds = mineOnly ? myTeamIds : draftedTeamIds
  const relevantGames = games.filter(
    (g) => filterIds.has(g.home_team_id) || filterIds.has(g.away_team_id)
  )

  const h2hGames = relevantGames.filter((g) => {
    const homeManager = teamToManager.get(g.home_team_id)
    const awayManager = teamToManager.get(g.away_team_id)
    return homeManager && awayManager && homeManager !== awayManager
      && !homeManager.startsWith('Scraps Team') && !awayManager.startsWith('Scraps Team')
  })

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <ScheduleHeader
          lastFetchedAt={cfbLastFetched}
          isAdmin={isAdmin}
          poolId={poolId}
          refreshAction={refreshSchedule}
        />
      </div>
      <div className="flex items-center gap-3">
        <Link href={`/pools/${poolId}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Pool
        </Link>
        <MyTeamsToggle active={mineOnly} />
      </div>

      <div className="flex flex-wrap gap-2">
        {weeks.map((w) => (
          <a
            key={w}
            href={`/pools/${poolId}/schedule?week=${w}${mineOnly ? '&mine=true' : ''}`}
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

      {(() => {
        const todayGames = relevantGames.filter((g) => isToday(g.start_time, userTz))
        const todayGameIds = new Set(todayGames.map((g) => g.id))
        const remainingGames = relevantGames.filter((g) => !todayGameIds.has(g.id))
        const remainingH2h = h2hGames.filter((g) => !todayGameIds.has(g.id))
        const remainingH2hIds = new Set(remainingH2h.map((g) => g.id))
        const remainingOther = remainingGames.filter((g) => !remainingH2hIds.has(g.id))

        return (
          <>
            {todayGames.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-primary">Today&apos;s Matchups</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sortByTime(todayGames).map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      teamMap={teamMap}
                      teamToManager={teamToManager}
                      teamToRound={teamToRound}
                    />
                  ))}
                </div>
              </div>
            )}

            {remainingH2h.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-primary">Head-to-Head Matchups</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sortByTime(remainingH2h).map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      teamMap={teamMap}
                      teamToManager={teamToManager}
                      teamToRound={teamToRound}
                    />
                  ))}
                </div>
              </div>
            )}

            {remainingOther.length > 0 && (
              <>
                {(todayGames.length > 0 || remainingH2h.length > 0) && (
                  <h3 className="font-medium text-muted-foreground">Other Games</h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {sortByTime(remainingOther).map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      teamMap={teamMap}
                      teamToManager={teamToManager}
                      teamToRound={teamToRound}
                    />
                  ))}
                </div>
              </>
            )}

            {relevantGames.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No games found for week {selectedWeek}. Try syncing schedule data.
                </CardContent>
              </Card>
            )}
          </>
        )
      })()}
    </div>
  )
}

async function WorldCupSchedule({
  poolId,
  pool,
  teamMap,
  teamToManager,
  teamToRound,
  draftedTeamIds,
  isAdmin,
  selectedStage,
  scoringConfig,
  userTz,
  mineOnly,
  myTeamIds,
}: {
  poolId: string
  pool: { season_year: number }
  teamMap: Map<string, CachedTeam>
  teamToManager: Map<string, string>
  teamToRound: Map<string, number>
  draftedTeamIds: Set<string>
  selectedStage: string
  scoringConfig: WorldCupScoringConfig
  isAdmin: boolean
  userTz: string
  mineOnly: boolean
  myTeamIds: Set<string>
}) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: gamesData } = await supabase
    .from('cached_games')
    .select('*')
    .eq('game_type', 'world_cup')
    .eq('season_year', pool.season_year)

  const allGames = (gamesData ?? []) as CachedGame[]
  const wcLastFetched = allGames.length > 0
    ? allGames.reduce((latest, g) => g.fetched_at > latest ? g.fetched_at : latest, allGames[0].fetched_at)
    : null

  // Group games by stage
  const gamesByStage = new Map<string, CachedGame[]>()
  for (const game of allGames) {
    const stage = game.stage ?? 'group'
    if (!gamesByStage.has(stage)) gamesByStage.set(stage, [])
    gamesByStage.get(stage)!.push(game)
  }

  const stageGames = gamesByStage.get(selectedStage) ?? []

  // Filter to relevant games (involving drafted/my teams)
  const filterIds = mineOnly ? myTeamIds : draftedTeamIds
  const relevantGames = stageGames.filter(
    (g) => filterIds.has(g.home_team_id) || filterIds.has(g.away_team_id)
  )

  const h2hGames = relevantGames.filter((g) => {
    const homeManager = teamToManager.get(g.home_team_id)
    const awayManager = teamToManager.get(g.away_team_id)
    return homeManager && awayManager && homeManager !== awayManager
      && !homeManager.startsWith('Scraps Team') && !awayManager.startsWith('Scraps Team')
  })

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <ScheduleHeader
          lastFetchedAt={wcLastFetched}
          isAdmin={isAdmin}
          poolId={poolId}
          refreshAction={refreshSchedule}
        />
      </div>
      <div className="flex items-center gap-3">
        <Link href={`/pools/${poolId}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Pool
        </Link>
        <MyTeamsToggle active={mineOnly} />
      </div>

      {/* Stage selector */}
      <div className="flex flex-wrap gap-2">
        {STAGE_ORDER.map((stage) => {
          const count = gamesByStage.get(stage)?.length ?? 0
          return (
            <a
              key={stage}
              href={`/pools/${poolId}/schedule?stage=${stage}${mineOnly ? '&mine=true' : ''}`}
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

      {(() => {
        const todayGames = relevantGames.filter((g) => isToday(g.start_time, userTz))
        const todayGameIds = new Set(todayGames.map((g) => g.id))
        const remainingGames = relevantGames.filter((g) => !todayGameIds.has(g.id))
        const remainingH2h = h2hGames.filter((g) => !todayGameIds.has(g.id))
        const remainingH2hIds = new Set(remainingH2h.map((g) => g.id))
        const remainingOther = remainingGames.filter((g) => !remainingH2hIds.has(g.id))

        return (
          <>
            {todayGames.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-primary">Today&apos;s Matchups</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sortByTime(todayGames).map((game) => (
                    <WcGameCard
                      key={game.id}
                      game={game}
                      teamMap={teamMap}
                      teamToManager={teamToManager}
                      teamToRound={teamToRound}
                      scoringConfig={scoringConfig}
                    />
                  ))}
                </div>
              </div>
            )}

            {remainingH2h.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-primary">Head-to-Head Matchups</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sortByTime(remainingH2h).map((game) => (
                    <WcGameCard
                      key={game.id}
                      game={game}
                      teamMap={teamMap}
                      teamToManager={teamToManager}
                      teamToRound={teamToRound}
                      scoringConfig={scoringConfig}
                    />
                  ))}
                </div>
              </div>
            )}

            {remainingOther.length > 0 && (
              <>
                {(todayGames.length > 0 || remainingH2h.length > 0) && (
                  <h3 className="font-medium text-muted-foreground">Other Games</h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {sortByTime(remainingOther).map((game) => (
                    <WcGameCard
                      key={game.id}
                      game={game}
                      teamMap={teamMap}
                      teamToManager={teamToManager}
                      teamToRound={teamToRound}
                      scoringConfig={scoringConfig}
                    />
                  ))}
                </div>
              </>
            )}

            {relevantGames.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No games involving your drafted teams in this stage yet.
                </CardContent>
              </Card>
            )}
          </>
        )
      })()}
    </div>
  )
}

function GameCard({
  game,
  teamMap,
  teamToManager,
  teamToRound,
}: {
  game: CachedGame
  teamMap: Map<string, CachedTeam>
  teamToManager: Map<string, string>
  teamToRound: Map<string, number>
}) {
  const homeTeam = teamMap.get(game.home_team_id)
  const awayTeam = teamMap.get(game.away_team_id)
  const homeManager = teamToManager.get(game.home_team_id)
  const awayManager = teamToManager.get(game.away_team_id)
  const homeRound = teamToRound.get(game.home_team_id)
  const awayRound = teamToRound.get(game.away_team_id)

  return (
    <Card>
      <CardContent className="py-3">
        {game.start_time && (
          <div className="mb-2 text-center text-xs text-muted-foreground">
            <GameTime startTime={game.start_time} />
            {(() => { const n = getBroadcastForLocale(game.broadcasts); return n ? <span className="ml-2">· {n}</span> : null })()}
            {game.status_detail && (
              <span className={`ml-2 ${game.status === 'in_progress' ? 'font-semibold text-green-600' : ''}`}>
                · {game.status_detail}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {awayTeam?.logo_url && (
              <Image src={awayTeam.logo_url} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
            )}
            <div>
              <span className="font-medium">{awayTeam?.name ?? game.away_team_id}</span>
              {awayRound && <span className="ml-1 text-xs text-muted-foreground">(r{awayRound})</span>}
              {awayManager && (
                <span className="ml-1 text-xs text-muted-foreground">— {awayManager}</span>
              )}
            </div>
          </div>
          <span className="text-lg font-bold">{game.away_score ?? '—'}</span>
        </div>
        <div className="my-1 text-center text-xs text-muted-foreground">@</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {homeTeam?.logo_url && (
              <Image src={homeTeam.logo_url} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
            )}
            <div>
              <span className="font-medium">{homeTeam?.name ?? game.home_team_id}</span>
              {homeRound && <span className="ml-1 text-xs text-muted-foreground">(r{homeRound})</span>}
              {homeManager && (
                <span className="ml-1 text-xs text-muted-foreground">— {homeManager}</span>
              )}
            </div>
          </div>
          <span className="text-lg font-bold">{game.home_score ?? '—'}</span>
        </div>
        {game.venue && (
          <div className="mt-2 text-center text-xs text-muted-foreground">{game.venue}</div>
        )}
      </CardContent>
    </Card>
  )
}

function WcGameCard({
  game,
  teamMap,
  teamToManager,
  teamToRound,
  scoringConfig,
}: {
  game: CachedGame
  teamMap: Map<string, CachedTeam>
  teamToManager: Map<string, string>
  teamToRound: Map<string, number>
  scoringConfig: WorldCupScoringConfig
}) {
  const homeTeam = teamMap.get(game.home_team_id)
  const awayTeam = teamMap.get(game.away_team_id)
  const homeManager = teamToManager.get(game.home_team_id)
  const awayManager = teamToManager.get(game.away_team_id)
  const homeRound = teamToRound.get(game.home_team_id)
  const awayRound = teamToRound.get(game.away_team_id)

  const statusDetail = game.status === 'in_progress'
    ? (game.status_detail ?? 'Live')
    : game.status === 'final'
      ? (game.is_shootout ? 'Final (Penalties)' : game.is_overtime ? 'Final (AET)' : (game.status_detail ?? 'Final'))
      : null

  const homeBreakdown = homeManager ? scoreWorldCupGame(game, game.home_team_id, scoringConfig) : null
  const awayBreakdown = awayManager ? scoreWorldCupGame(game, game.away_team_id, scoringConfig) : null
  const hasBreakdown = homeBreakdown || awayBreakdown

  const gameContent = (
    <>
      {game.start_time && (
        <div className="mb-2 text-center text-xs text-muted-foreground">
          <GameTime startTime={game.start_time} />
          {(() => { const n = getBroadcastForLocale(game.broadcasts); return n ? <span className="ml-2">· {n}</span> : null })()}
          {statusDetail && (
            <span className={`ml-2 ${game.status === 'in_progress' ? 'font-semibold text-green-600' : ''}`}>
              · {statusDetail}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {homeTeam?.logo_url && (
            <Image src={homeTeam.logo_url} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
          )}
          <div>
            <span className="font-medium">{homeTeam?.name ?? game.home_team_id}</span>
            {homeRound && <span className="ml-1 text-xs text-muted-foreground">(r{homeRound})</span>}
            {homeManager && (
              <span className="ml-1 text-xs text-muted-foreground">— {homeManager}</span>
            )}
          </div>
        </div>
        <span className="text-lg font-bold">{game.home_score ?? '—'}</span>
      </div>
      <div className="my-1 text-center text-xs text-muted-foreground">
        vs
        {game.is_shootout && game.status === 'final' && (
          <span className="ml-1">
            ({game.home_penalty_score} - {game.away_penalty_score})
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {awayTeam?.logo_url && (
            <Image src={awayTeam.logo_url} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
          )}
          <div>
            <span className="font-medium">{awayTeam?.name ?? game.away_team_id}</span>
            {awayRound && <span className="ml-1 text-xs text-muted-foreground">(r{awayRound})</span>}
            {awayManager && (
              <span className="ml-1 text-xs text-muted-foreground">— {awayManager}</span>
            )}
          </div>
        </div>
        <span className="text-lg font-bold">{game.away_score ?? '—'}</span>
      </div>
      {game.venue && (
        <div className="mt-2 text-center text-xs text-muted-foreground">{game.venue}</div>
      )}
    </>
  )

  if (!hasBreakdown) {
    return (
      <Card>
        <CardContent className="py-3">{gameContent}</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-3">
        <details>
          <summary className="cursor-pointer list-none">{gameContent}</summary>
          <div className="mt-3 space-y-2 border-t pt-3">
            {homeBreakdown && homeManager && (
              <ScoreBreakdownRow
                managerName={homeManager}
                teamName={homeTeam?.name ?? game.home_team_id}
                round={homeRound}
                breakdown={homeBreakdown}
              />
            )}
            {awayBreakdown && awayManager && (
              <ScoreBreakdownRow
                managerName={awayManager}
                teamName={awayTeam?.name ?? game.away_team_id}
                round={awayRound}
                breakdown={awayBreakdown}
              />
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  )
}

function ScoreBreakdownRow({
  managerName,
  teamName,
  round,
  breakdown,
}: {
  managerName: string
  teamName: string
  round?: number
  breakdown: NonNullable<ReturnType<typeof scoreWorldCupGame>>
}) {
  return (
    <div className="rounded-md bg-muted/50 p-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{teamName}{round && <span className="font-normal text-muted-foreground"> (r{round})</span>} <span className="text-muted-foreground">— {managerName}</span></span>
        <span className="font-bold">{breakdown.points} pts</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Result: {breakdown.result}</span>
        {breakdown.itemized.map((item, i) => (
          <span key={i}>{item.label}: +{item.value}</span>
        ))}
      </div>
    </div>
  )
}
