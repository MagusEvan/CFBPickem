// Compact display formatting for stored stat lines and NFL game context.
// Pure and client-safe — no queries, no server imports.

import type { FFStatLine, FFNflGame, FFPosition } from './types'

/**
 * One-line box-score summary ordered by position relevance, e.g.
 * QB: "21/34, 245 pass yds, 2 TD, 1 INT · 32 rush yds"
 * RB: "84 rush yds, 1 TD · 3 rec, 22 yds"
 * Weeks ingested before cmp/att/targets were mapped simply omit them.
 */
export function formatStatLine(stats: FFStatLine, position: FFPosition): string {
  const passing = (): string | null => {
    const { pass_cmp, pass_att, pass_yd, pass_td, pass_int, pass_2pt } = stats
    if (!pass_att && !pass_yd && !pass_td && !pass_int) return null
    const parts: string[] = []
    if (pass_att) parts.push(`${pass_cmp ?? 0}/${pass_att}`)
    parts.push(`${pass_yd ?? 0} pass yds`)
    if (pass_td) parts.push(`${pass_td} TD`)
    if (pass_int) parts.push(`${pass_int} INT`)
    if (pass_2pt) parts.push(`${pass_2pt} 2PT`)
    return parts.join(', ')
  }

  const rushing = (): string | null => {
    const { rush_yd, rush_td, rush_2pt } = stats
    if (!rush_yd && !rush_td) return null
    const parts = [`${rush_yd ?? 0} rush yds`]
    if (rush_td) parts.push(`${rush_td} TD`)
    if (rush_2pt) parts.push(`${rush_2pt} 2PT`)
    return parts.join(', ')
  }

  const receiving = (): string | null => {
    const { rec, targets, rec_yd, rec_td, rec_2pt } = stats
    if (!rec && !targets && !rec_yd && !rec_td) return null
    const parts = [`${rec ?? 0}${targets ? `/${targets}` : ''} rec`]
    parts.push(`${rec_yd ?? 0} yds`)
    if (rec_td) parts.push(`${rec_td} TD`)
    if (rec_2pt) parts.push(`${rec_2pt} 2PT`)
    return parts.join(', ')
  }

  const kicking = (): string | null => {
    const made = (stats.fg_0_39 ?? 0) + (stats.fg_40_49 ?? 0) + (stats.fg_50_plus ?? 0)
    const att = made + (stats.fg_miss ?? 0)
    const xpAtt = (stats.xp ?? 0) + (stats.xp_miss ?? 0)
    if (!att && !xpAtt) return null
    const parts: string[] = []
    if (att) parts.push(`${made}/${att} FG${stats.fg_50_plus ? ` (${stats.fg_50_plus} 50+)` : ''}`)
    if (xpAtt) parts.push(`${stats.xp ?? 0}/${xpAtt} XP`)
    return parts.join(', ')
  }

  const dst = (): string | null => {
    const { dst_sack, dst_int, dst_fum_rec, dst_td, dst_safety, dst_points_allowed } = stats
    if (
      !dst_sack && !dst_int && !dst_fum_rec && !dst_td && !dst_safety &&
      dst_points_allowed === undefined
    ) return null
    const parts: string[] = []
    if (dst_sack) parts.push(`${dst_sack} sack${dst_sack === 1 ? '' : 's'}`)
    if (dst_int) parts.push(`${dst_int} INT`)
    if (dst_fum_rec) parts.push(`${dst_fum_rec} FR`)
    if (dst_td) parts.push(`${dst_td} TD`)
    if (dst_safety) parts.push(`${dst_safety} SFTY`)
    if (dst_points_allowed !== undefined) parts.push(`${dst_points_allowed} PA`)
    return parts.join(', ')
  }

  const fumbles = stats.fum_lost ? `${stats.fum_lost} fum lost` : null

  const byPosition: Record<FFPosition, Array<string | null>> = {
    QB: [passing(), rushing(), fumbles],
    RB: [rushing(), receiving(), passing(), fumbles],
    WR: [receiving(), rushing(), passing(), fumbles],
    TE: [receiving(), rushing(), fumbles],
    K: [kicking()],
    DST: [dst()],
  }
  return byPosition[position].filter(Boolean).join(' · ')
}

export interface PlayerGameInfo {
  /** "vs KC" or "@ KC" */
  matchup: string
  status: FFNflGame['status']
  /** Live: "0:42 - 4th · 21-17"; final: "W 27-17". Null while scheduled (show start time). */
  detail: string | null
  startTime: string
  live: boolean
}

/** team_id -> that week's game, for game-context lookups. */
export function weekGamesByTeamId(games: FFNflGame[]): Map<string, FFNflGame> {
  const map = new Map<string, FFNflGame>()
  for (const g of games) {
    if (g.home_team_id) map.set(g.home_team_id, g)
    if (g.away_team_id) map.set(g.away_team_id, g)
  }
  return map
}

export function playerGameInfo(
  teamId: string | null,
  gamesByTeam: Map<string, FFNflGame>,
  abbrevByTeamId: Map<string, string>
): PlayerGameInfo | null {
  if (!teamId) return null
  const game = gamesByTeam.get(teamId)
  if (!game) return null

  const isHome = game.home_team_id === teamId
  const oppId = isHome ? game.away_team_id : game.home_team_id
  const opp = oppId ? abbrevByTeamId.get(oppId) ?? '—' : '—'
  const matchup = `${isHome ? 'vs' : '@'} ${opp}`

  const myScore = (isHome ? game.home_score : game.away_score) ?? 0
  const oppScore = (isHome ? game.away_score : game.home_score) ?? 0

  let detail: string | null = null
  if (game.status === 'in_progress') {
    detail = `${game.status_detail ? `${game.status_detail} · ` : ''}${myScore}-${oppScore}`
  } else if (game.status === 'final') {
    const outcome = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'T'
    detail = `${outcome} ${myScore}-${oppScore}`
  }

  return {
    matchup,
    status: game.status,
    detail,
    startTime: game.start_time,
    live: game.status === 'in_progress',
  }
}
