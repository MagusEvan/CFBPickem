import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { calculateStandings, calculateWorldCupStandings } from '@/lib/scoring/engine'
import { calculateTeamPoints, type GamePointBreakdown } from '@/lib/scoring/strategies/world-cup'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import type { DraftPick, CachedTeam, CachedGame, TeamScraps, WcScrapsTeam, WorldCupScoringConfig } from '@/lib/types'

export const revalidate = 60

const DEFAULT_WC_SCORING: WorldCupScoringConfig = {
  group: { win: 6, draw: 3, goal_points: 1, goal_cap: 3, shutout: 1 },
  knockout: {
    win: 6, ot_win: 5, shootout_win: 4, shootout_loss: 2,
    ot_loss: 1, loss: 0, goal_points: 1, goal_cap: null, shutout: 1,
  },
}

function didLoseGame(game: CachedGame, teamId: string): boolean {
  const isHome = game.home_team_id === teamId
  if (game.is_shootout) {
    const myPK = isHome ? game.home_penalty_score ?? 0 : game.away_penalty_score ?? 0
    const oppPK = isHome ? game.away_penalty_score ?? 0 : game.home_penalty_score ?? 0
    return myPK < oppPK
  }
  const myScore = isHome ? game.home_score ?? 0 : game.away_score ?? 0
  const oppScore = isHome ? game.away_score ?? 0 : game.home_score ?? 0
  return myScore < oppScore
}

/**
 * A team is eliminated when it has no remaining games and either:
 * - it lost a knockout game, or
 * - it played all its group games but never advanced to a knockout game
 *   (only once the knockout bracket has real teams assigned).
 */
function computeEliminatedTeams(games: CachedGame[]): Set<string> {
  const eliminated = new Set<string>()

  const groupTeamIds = new Set<string>()
  for (const g of games) {
    if ((g.stage ?? 'group') === 'group') {
      groupTeamIds.add(g.home_team_id)
      groupTeamIds.add(g.away_team_id)
    }
  }
  const knockoutStarted = games.some(
    (g) =>
      g.stage != null && g.stage !== 'group' &&
      groupTeamIds.has(g.home_team_id) && groupTeamIds.has(g.away_team_id)
  )

  const allTeamIds = new Set<string>()
  for (const g of games) {
    allTeamIds.add(g.home_team_id)
    allTeamIds.add(g.away_team_id)
  }

  for (const teamId of allTeamIds) {
    const teamGames = games.filter((g) => g.home_team_id === teamId || g.away_team_id === teamId)
    if (teamGames.some((g) => g.status !== 'final')) continue // still has games to play

    const knockoutGames = teamGames.filter((g) => g.stage != null && g.stage !== 'group')
    if (knockoutGames.length > 0) {
      // Out if they lost any knockout game (the champion never loses one)
      if (knockoutGames.some((g) => didLoseGame(g, teamId))) eliminated.add(teamId)
    } else {
      const groupGamesPlayed = teamGames.filter((g) => (g.stage ?? 'group') === 'group').length
      if (groupGamesPlayed >= 3 && knockoutStarted) eliminated.add(teamId)
    }
  }

  return eliminated
}

const KNOCKOUT_ROUND_ORDER = ['round_of_32', 'round_of_16', 'quarter', 'semi', 'final']

/**
 * Max games a team could still play: games already on their schedule that
 * aren't final, plus one game per future knockout round if they keep winning.
 * (Third place isn't counted as extra — it replaces the final for semi losers.)
 */
function possibleGamesRemaining(games: CachedGame[], teamId: string, eliminated: Set<string>): number {
  if (eliminated.has(teamId)) return 0

  const teamGames = games.filter((g) => g.home_team_id === teamId || g.away_team_id === teamId)
  const scheduled = teamGames.filter((g) => g.status !== 'final').length

  // Semi losers can only play the third-place game (counted in scheduled if assigned)
  const lostSemi = teamGames.some(
    (g) => g.stage === 'semi' && g.status === 'final' && didLoseGame(g, teamId)
  )
  if (lostSemi) return scheduled

  // Knockout rounds this tournament actually has (fall back to full bracket if none published yet)
  const stagesPresent = new Set(games.map((g) => g.stage))
  const rounds = KNOCKOUT_ROUND_ORDER.filter((r) => stagesPresent.has(r))
  const tournamentRounds = rounds.length > 0 ? rounds : KNOCKOUT_ROUND_ORDER

  // Furthest knockout round the team already appears in
  let maxIdx = -1
  for (const g of teamGames) {
    if (g.stage && g.stage !== 'group' && g.stage !== 'third_place') {
      maxIdx = Math.max(maxIdx, tournamentRounds.indexOf(g.stage))
    }
  }

  return scheduled + (tournamentRounds.length - 1 - maxIdx)
}

export default async function StandingsPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
  ])

  if (!pool) notFound()

  if (pool.draft_status === 'pre_draft') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Standings</h1>
        <Link href={`/pools/${poolId}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Pool
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Standings will be available after the draft is complete.
          </CardContent>
        </Card>
      </div>
    )
  }

  const supabase = await createClient()

  if (pool.game_type === 'world_cup') {
    return <WorldCupStandings poolId={poolId} pool={pool} members={members} />
  }

  // CFB standings
  const [picksRes, teamsRes, scrapsRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId),
    supabase.from('cached_teams').select('id,name,wins,losses,logo_url').eq('season_year', pool.season_year),
    supabase.from('team_scraps').select('*').eq('pool_id', poolId),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const teams = (teamsRes.data ?? []) as CachedTeam[]
  const scraps = (scrapsRes.data ?? []) as TeamScraps[]

  const standings = calculateStandings(members, picks, teams, pool.scoring_strategy)
  const teamMap = new Map(teams.map((t) => [t.id, t]))

  const scrapsTotal = scraps.reduce((sum, s) => {
    const team = teamMap.get(s.team_id)
    return sum + (team?.wins ?? s.wins)
  }, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Standings</h1>
      <Link href={`/pools/${poolId}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
        &lt; Return to Pool
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-2 text-left">Rank</th>
                <th className="px-2 py-2 text-left">Manager</th>
                <th className="px-2 py-2 text-center">W</th>
                <th className="px-2 py-2 text-center">L</th>
                <th className="px-2 py-2 text-center">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.memberId} className="border-b">
                  <td className="px-2 py-2 font-medium">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/pools/${poolId}/rosters/${s.memberId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {s.displayName}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-center">{s.totalWins}</td>
                  <td className="px-2 py-2 text-center">{s.totalLosses}</td>
                  <td className="px-2 py-2 text-center font-bold">{s.totalPoints}</td>
                </tr>
              ))}
              <tr className="border-b bg-muted/30">
                <td className="px-2 py-2 text-muted-foreground">—</td>
                <td className="px-2 py-2 text-muted-foreground italic">Team Scraps</td>
                <td className="px-2 py-2 text-center text-muted-foreground">{scrapsTotal}</td>
                <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                <td className="px-2 py-2 text-center font-bold text-muted-foreground">{scrapsTotal}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {scraps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Team Scraps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {scraps.map((s) => {
                const team = teamMap.get(s.team_id)
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      {team?.logo_url && (
                        <Image src={team.logo_url} alt={s.team_name} width={24} height={24} className="h-6 w-6 object-contain" />
                      )}
                      <span className="text-sm font-medium">{s.team_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{s.conference_key}</Badge>
                      <span className="text-sm">{team?.wins ?? s.wins}W</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

async function WorldCupStandings({
  poolId,
  pool,
  members,
}: {
  poolId: string
  pool: { season_year: number; scoring_config: WorldCupScoringConfig | null }
  members: Parameters<typeof calculateWorldCupStandings>[0]
}) {
  const supabase = await createClient()

  const [picksRes, gamesRes, wcScrapsRes] = await Promise.all([
    supabase.from('draft_picks').select('*').eq('pool_id', poolId),
    supabase.from('cached_games').select('id,home_team_id,away_team_id,home_score,away_score,status,stage,is_overtime,is_shootout,home_penalty_score,away_penalty_score,start_time').eq('game_type', 'world_cup').eq('season_year', pool.season_year).order('start_time', { ascending: true, nullsFirst: false }),
    supabase.from('wc_scraps_teams').select('*').eq('pool_id', poolId),
  ])

  const picks = (picksRes.data ?? []) as DraftPick[]
  const games = (gamesRes.data ?? []) as CachedGame[]
  const wcScraps = (wcScrapsRes.data ?? []) as WcScrapsTeam[]
  const config = pool.scoring_config ?? DEFAULT_WC_SCORING
  const teamToRound = new Map(picks.map((p) => [p.team_id, p.round]))
  const eliminatedTeams = computeEliminatedTeams(games)
  const pgrCache = new Map<string, number>()
  const teamPgr = (teamId: string) => {
    if (!pgrCache.has(teamId)) pgrCache.set(teamId, possibleGamesRemaining(games, teamId, eliminatedTeams))
    return pgrCache.get(teamId)!
  }

  // Pre-compute team points once — avoids calling calculateTeamPoints multiple times per team
  const allTeamIds = new Set([
    ...picks.map((p) => p.team_id),
    ...wcScraps.map((s) => s.team_id),
  ])
  const teamPointsCache = new Map<string, ReturnType<typeof calculateTeamPoints>>()
  for (const teamId of allTeamIds) {
    teamPointsCache.set(teamId, calculateTeamPoints(games, teamId, config))
  }

  // Build manager standings directly from cache (avoids redundant calculateTeamPoints calls in engine)
  const enrichedManagerStandings = members
    .map((member) => {
      const memberPicks = picks.filter((p) => p.member_id === member.id)
      let totalPoints = 0
      const teamBreakdowns = memberPicks.map((pick) => {
        const cached = teamPointsCache.get(pick.team_id)!
        totalPoints += cached.totalPoints
        return {
          teamId: pick.team_id,
          teamName: pick.team_name,
          points: cached.totalPoints,
          gamesPlayed: cached.breakdown.length,
          gameBreakdowns: cached.breakdown,
        }
      })
      return {
        memberId: member.id,
        displayName: member.profiles.display_name,
        totalPoints,
        teamBreakdowns,
      }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)

  // Build scraps team standings
  const scrapsTeamNumbers = [...new Set(wcScraps.map((s) => s.scraps_team_number))].sort()
  const scrapsStandings = scrapsTeamNumbers.map((num) => {
    const teamRows = wcScraps.filter((s) => s.scraps_team_number === num)
    const teamBreakdowns = teamRows.map((row) => {
      const cached = teamPointsCache.get(row.team_id)!
      return {
        teamId: row.team_id,
        teamName: row.team_name,
        points: cached.totalPoints,
        gamesPlayed: cached.breakdown.length,
        gameBreakdowns: cached.breakdown,
      }
    })
    return {
      scrapsTeamNumber: num,
      displayName: `Scraps Team ${num}`,
      totalPoints: teamBreakdowns.reduce((sum, tb) => sum + tb.points, 0),
      teamBreakdowns,
    }
  })

  // Merge managers and scraps into one sorted list
  type TeamBreakdownWithGames = {
    teamId: string
    teamName: string
    points: number
    gamesPlayed: number
    gameBreakdowns: GamePointBreakdown[]
  }
  type StandingEntry =
    | { type: 'manager'; memberId: string; displayName: string; totalPoints: number; teamBreakdowns: TeamBreakdownWithGames[] }
    | { type: 'scraps'; scrapsTeamNumber: number; displayName: string; totalPoints: number; teamBreakdowns: TeamBreakdownWithGames[] }

  // Aggregate scoring categories per entry
  function aggregateCategories(teamBreakdowns: TeamBreakdownWithGames[]) {
    const totals: Record<string, number> = {}
    for (const tb of teamBreakdowns) {
      for (const gb of tb.gameBreakdowns) {
        for (const item of gb.itemized) {
          totals[item.label] = (totals[item.label] ?? 0) + item.value
        }
      }
    }
    return totals
  }

  // Column order for scoring categories
  const categoryOrder = ['Win', 'Draw', 'OT Win', 'PK Win', 'PK Loss', 'OT Loss', 'Goals', 'Shutout']

  const combined: StandingEntry[] = [
    ...enrichedManagerStandings.map((s) => ({ type: 'manager' as const, ...s })),
    ...scrapsStandings.map((s) => ({ type: 'scraps' as const, ...s })),
  ].sort((a, b) => b.totalPoints - a.totalPoints)

  // Find which categories actually have points across all entries
  const allCategories = new Map<string, number>()
  for (const entry of combined) {
    const cats = aggregateCategories(entry.teamBreakdowns)
    for (const [label, val] of Object.entries(cats)) {
      allCategories.set(label, (allCategories.get(label) ?? 0) + val)
    }
  }
  const activeCategories = categoryOrder.filter((c) => allCategories.has(c))

  // Short labels for column headers
  const shortLabel: Record<string, string> = {
    'Win': 'W', 'Draw': 'D', 'OT Win': 'OTW', 'PK Win': 'PKW',
    'PK Loss': 'PKL', 'OT Loss': 'OTL', 'Goals': 'G', 'Shutout': 'SO',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Standings</h1>
      <Link href={`/pools/${poolId}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
        &lt; Return to Pool
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Manager</th>
                <th className="px-2 py-2 text-center text-xs">GP</th>
                <th className="px-2 py-2 text-center text-xs border-r" title="Possible Games Remaining">PGR</th>
                {activeCategories.map((cat) => (
                  <th key={cat} className="px-2 py-2 text-center text-xs" title={cat}>
                    {shortLabel[cat] ?? cat}
                  </th>
                ))}
                <th className="px-2 py-2 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {combined.map((s, i) => {
                const key = s.type === 'manager' ? s.memberId : `scraps-${s.scrapsTeamNumber}`
                const isScraps = s.type === 'scraps'
                const cats = aggregateCategories(s.teamBreakdowns)
                return (
                  <tr key={key} className={`border-b ${isScraps ? 'bg-muted/30' : ''}`}>
                    <td className={`px-2 py-2 font-medium ${isScraps ? 'text-muted-foreground' : ''}`}>{i + 1}</td>
                    <td className={`px-2 py-2 ${isScraps ? 'text-muted-foreground italic' : ''}`}>
                      {s.type === 'manager' ? (
                        <Link
                          href={`/pools/${poolId}/rosters/${s.memberId}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {s.displayName}
                        </Link>
                      ) : (
                        s.displayName
                      )}
                    </td>
                    <td className={`px-2 py-2 text-center ${isScraps ? 'text-muted-foreground' : ''}`}>
                      {s.teamBreakdowns.reduce((sum, tb) => sum + tb.gamesPlayed, 0)}
                    </td>
                    <td className={`px-2 py-2 text-center border-r ${isScraps ? 'text-muted-foreground' : ''}`}>
                      {s.teamBreakdowns.reduce((sum, tb) => sum + teamPgr(tb.teamId), 0)}
                    </td>
                    {activeCategories.map((cat) => (
                      <td key={cat} className={`px-2 py-2 text-center ${isScraps ? 'text-muted-foreground' : ''}`}>
                        {cats[cat] ?? 0}
                      </td>
                    ))}
                    <td className={`px-2 py-2 text-center font-bold ${isScraps ? 'text-muted-foreground' : ''}`}>{s.totalPoints}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Per-entry team breakdowns */}
      {combined.map((s) => {
        const key = s.type === 'manager' ? s.memberId : `scraps-${s.scrapsTeamNumber}`
        const isScraps = s.type === 'scraps'
        return (
          <Card key={key} className={isScraps ? 'border-dashed' : ''}>
            <CardHeader>
              <CardTitle className="text-base">
                {s.displayName} — {s.totalPoints} pts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {s.teamBreakdowns
                  .sort((a, b) => b.points - a.points)
                  .map((tb) => (
                    <details
                      key={tb.teamId}
                      className={`rounded-md border ${eliminatedTeams.has(tb.teamId) ? 'bg-red-100/60 dark:bg-red-950/40' : ''}`}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between p-2">
                        <span className="text-sm font-medium">
                          {tb.teamName}
                          {teamToRound.has(tb.teamId) && (
                            <span className="ml-1 font-normal text-muted-foreground">(r{teamToRound.get(tb.teamId)})</span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {tb.gamesPlayed} GP
                          </Badge>
                          <span className="text-sm font-bold">{tb.points} pts</span>
                        </div>
                      </summary>
                      {tb.gameBreakdowns.length > 0 ? (
                        <div className="space-y-1 border-t px-2 py-2">
                          {tb.gameBreakdowns.map((gb) => (
                            <div key={gb.gameId} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] px-1">{gb.result}</Badge>
                                <span>vs {gb.opponent}</span>
                                <span className="text-muted-foreground">{gb.myGoals}–{gb.oppGoals}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                {gb.itemized.map((item, i) => (
                                  <span key={i}>{item.label}: +{item.value}</span>
                                ))}
                                <span className="font-bold text-foreground">{gb.points} pts</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border-t px-2 py-2 text-xs text-muted-foreground">
                          No completed games yet
                        </div>
                      )}
                    </details>
                  ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
