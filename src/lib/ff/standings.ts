// Pure H2H standings math from completed matchup results.

export interface FFMatchupResult {
  week: number
  homeMemberId: string
  /** null = bye week (no result recorded) */
  awayMemberId: string | null
  homeScore: number
  awayScore: number
  /** Only weeks where every NFL game is final count toward the record */
  final: boolean
}

export interface FFStanding {
  memberId: string
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
}

/**
 * W/L/T + PF/PA per member, sorted by win percentage (a tie = half a win)
 * then PF as the tiebreaker. Byes and non-final weeks contribute nothing.
 */
export function computeStandings(
  memberIds: string[],
  results: FFMatchupResult[]
): FFStanding[] {
  const byId = new Map<string, FFStanding>(
    memberIds.map((id) => [
      id,
      { memberId: id, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
    ])
  )

  for (const r of results) {
    if (!r.final || r.awayMemberId === null) continue
    const home = byId.get(r.homeMemberId)
    const away = byId.get(r.awayMemberId)
    if (!home || !away) continue

    home.pointsFor += r.homeScore
    home.pointsAgainst += r.awayScore
    away.pointsFor += r.awayScore
    away.pointsAgainst += r.homeScore

    if (r.homeScore > r.awayScore) {
      home.wins++
      away.losses++
    } else if (r.homeScore < r.awayScore) {
      away.wins++
      home.losses++
    } else {
      home.ties++
      away.ties++
    }
  }

  const winPct = (s: FFStanding) => {
    const games = s.wins + s.losses + s.ties
    return games > 0 ? (s.wins + s.ties * 0.5) / games : 0
  }
  return [...byId.values()].sort(
    (a, b) => winPct(b) - winPct(a) || b.pointsFor - a.pointsFor
  )
}

/** Top-N member ids in seed order (standings must already be sorted). */
export function playoffSeeds(standings: FFStanding[], playoffTeams: number): string[] {
  return standings.slice(0, playoffTeams).map((s) => s.memberId)
}

/**
 * Current run of consecutive same-outcome results, e.g. "W3" / "L1" / "T2".
 * Byes and non-final weeks are skipped; null = no completed games.
 */
export function currentStreak(results: FFMatchupResult[], memberId: string): string | null {
  const outcomes: Array<'W' | 'L' | 'T'> = []
  for (const r of [...results].sort((a, b) => a.week - b.week)) {
    if (!r.final || r.awayMemberId === null) continue
    let mine: number, theirs: number
    if (r.homeMemberId === memberId) [mine, theirs] = [r.homeScore, r.awayScore]
    else if (r.awayMemberId === memberId) [mine, theirs] = [r.awayScore, r.homeScore]
    else continue
    outcomes.push(mine > theirs ? 'W' : mine < theirs ? 'L' : 'T')
  }
  if (outcomes.length === 0) return null
  const last = outcomes[outcomes.length - 1]
  let len = 0
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === last; i--) len++
  return `${last}${len}`
}
