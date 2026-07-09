// Ranking ingestion + composite math. No 'use server' — shared by admin
// actions and catalog refresh.

import {
  fetchEspnRanks,
  fetchYahooRanks,
  fetchSleeperRanks,
  fetchFantasyProsRanks,
  namePositionKey,
} from '@/lib/data-providers/rankings'
import type { Admin } from './waiver-processing'
import type { FFPlayer } from './types'

/** Mean of the available source ranks (null when no source ranks the player). */
export function compositeRank(
  ranks: Array<number | null | undefined>
): number | null {
  const present = ranks.filter((r): r is number => typeof r === 'number')
  if (present.length === 0) return null
  return Math.round((present.reduce((s, r) => s + r, 0) / present.length) * 100) / 100
}

/** The composite that actually drives draft order: manual override wins. */
export function effectiveComposite(
  p: Pick<FFPlayer, 'rank_composite' | 'rank_composite_override'>
): number | null {
  return p.rank_composite_override ?? p.rank_composite
}

/**
 * Reassign default_rank (the effective draft order used by the draft board
 * sort and timer autopick) from the effective composite: composite-ranked
 * players first in composite order, everyone else keeps their relative order
 * behind them. Writes only rows whose default_rank changed.
 */
export async function recomputeEffectiveRanks(admin: Admin): Promise<void> {
  const { data } = await admin.from('ff_players').select('*')
  const players = (data ?? []) as FFPlayer[]
  if (players.length === 0) return

  const inf = Number.POSITIVE_INFINITY
  const sorted = [...players].sort(
    (a, b) =>
      (effectiveComposite(a) ?? inf) - (effectiveComposite(b) ?? inf) ||
      (a.default_rank ?? inf) - (b.default_rank ?? inf) ||
      a.name.localeCompare(b.name)
  )

  const changed: FFPlayer[] = []
  sorted.forEach((p, i) => {
    if (p.default_rank !== i + 1) changed.push({ ...p, default_rank: i + 1 })
  })

  for (let i = 0; i < changed.length; i += 500) {
    const { error } = await admin.from('ff_players').upsert(changed.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }
}

export interface RankingRefreshSummary {
  espn: number | null
  yahoo: number | null
  sleeper: number | null
  fantasypros: number | null
}

/**
 * Pull ranks from every public source (partial failures tolerated — a failed
 * source leaves its column untouched and reports null), recompute composites,
 * and reassign the effective draft order.
 */
export async function refreshRankingsFromSources(
  admin: Admin,
  seasonYear: number
): Promise<RankingRefreshSummary> {
  const [espnRes, yahooRes, sleeperRes, fpRes] = await Promise.allSettled([
    fetchEspnRanks(seasonYear),
    fetchYahooRanks(),
    fetchSleeperRanks(),
    fetchFantasyProsRanks(),
  ])
  const espn = espnRes.status === 'fulfilled' ? espnRes.value : null
  const yahoo = yahooRes.status === 'fulfilled' ? yahooRes.value : null
  const sleeper = sleeperRes.status === 'fulfilled' ? sleeperRes.value : null
  const fp = fpRes.status === 'fulfilled' ? fpRes.value : null
  if (!espn && !yahoo && !sleeper && !fp) {
    const reason = espnRes.status === 'rejected' ? espnRes.reason : 'unknown'
    throw new Error(`All ranking sources failed (${reason})`)
  }

  const { data } = await admin.from('ff_players').select('*')
  const players = (data ?? []) as FFPlayer[]

  const summary: RankingRefreshSummary = {
    espn: espn ? 0 : null,
    yahoo: yahoo ? 0 : null,
    sleeper: sleeper ? 0 : null,
    fantasypros: fp ? 0 : null,
  }

  const changed: FFPlayer[] = []
  for (const p of players) {
    const next = { ...p }

    if (espn) {
      next.rank_espn =
        (p.position === 'DST'
          ? p.nfl_team_id
            ? espn.dstByTeamId.get(p.nfl_team_id)
            : undefined
          : espn.byAthleteId.get(p.id)) ?? null
      if (next.rank_espn !== null) summary.espn!++
    }
    if (yahoo) {
      next.rank_yahoo =
        (p.position === 'DST'
          ? p.nfl_team_abbrev
            ? yahoo.dstByTeamAbbrev.get(p.nfl_team_abbrev)
            : undefined
          : yahoo.byNamePosition.get(namePositionKey(p.name, p.position))) ?? null
      if (next.rank_yahoo !== null) summary.yahoo!++
    }
    if (sleeper) {
      next.rank_sleeper =
        (p.position === 'DST'
          ? p.nfl_team_abbrev
            ? sleeper.dstByTeamAbbrev.get(p.nfl_team_abbrev)
            : undefined
          : sleeper.byEspnId.get(p.id) ??
            sleeper.byNamePosition.get(namePositionKey(p.name, p.position))) ?? null
      if (next.rank_sleeper !== null) summary.sleeper!++
    }
    if (fp) {
      next.rank_fantasypros =
        (p.position === 'DST'
          ? p.nfl_team_abbrev
            ? fp.dstByTeamAbbrev.get(p.nfl_team_abbrev)
            : undefined
          : fp.byNamePosition.get(namePositionKey(p.name, p.position))) ?? null
      if (next.rank_fantasypros !== null) summary.fantasypros!++
    }

    next.rank_composite = compositeRank([
      next.rank_espn,
      next.rank_yahoo,
      next.rank_sleeper,
      next.rank_fantasypros,
    ])

    // rank_composite is a float4 — compare with a tolerance so storage
    // precision doesn't mark every row changed on each refresh
    const compositeChanged =
      (next.rank_composite === null) !== (p.rank_composite === null) ||
      Math.abs((next.rank_composite ?? 0) - (p.rank_composite ?? 0)) > 0.005
    if (
      next.rank_espn !== p.rank_espn ||
      next.rank_yahoo !== p.rank_yahoo ||
      next.rank_sleeper !== p.rank_sleeper ||
      next.rank_fantasypros !== p.rank_fantasypros ||
      compositeChanged
    ) {
      changed.push(next)
    }
  }

  for (let i = 0; i < changed.length; i += 500) {
    const { error } = await admin.from('ff_players').upsert(changed.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }

  await recomputeEffectiveRanks(admin)
  return summary
}
