// Lazy playoff bracket generation/advancement, triggered from standings and
// matchup page loads (no cron). No 'use server' and no revalidatePath so it
// can run during render. Inserts are idempotent via the ff_matchups
// unique(pool_id, week, home_member_id) + ignoreDuplicates upsert, so
// concurrent page loads can't double-create a round.

import { getFfLineups, getFfMatchups, getFfWeekScores, type FFWeekScores } from './queries'
import { resolveScoringSettings } from './settings'
import { computeStandings, playoffSeeds, type FFMatchupResult } from './standings'
import { playoffRoundsCount, roundPairings, pairingWinner, type PlayoffPairing } from './playoffs'
import type { Admin } from './waiver-processing'
import type { FFLeagueSettings, FFMatchup } from './types'
import type { Pool } from '@/lib/types'

type PlayoffPool = Pick<Pool, 'id' | 'season_year' | 'ff_scoring_settings'>

/** Week scores through a given week. The default materializes lineup rows
 * (getFfLineups) — best ball pools must pass their own provider so that
 * ff_lineup_slots is never written. */
export type PlayoffScoreProvider = (
  pool: PlayoffPool,
  throughWeek: number
) => Promise<FFWeekScores[]>

const defaultScoreProvider: PlayoffScoreProvider = async (pool, throughWeek) => {
  for (let w = 1; w <= throughWeek; w++) await getFfLineups(pool.id, w)
  const scoring = resolveScoringSettings(pool)
  return getFfWeekScores(pool.id, pool.season_year, scoring, throughWeek)
}

/**
 * Generate the round-1 bracket once the regular season is final, and advance
 * each subsequent round once its previous playoff week is final. No-op until
 * the current week is past the regular season, and once the bracket is fully
 * generated. Round r plays at week playoffStartWeek + r - 1; winners decided
 * by lineup score (tie -> better seed), byes auto-advance.
 */
export async function ensurePlayoffs(
  admin: Admin,
  pool: PlayoffPool,
  settings: FFLeagueSettings,
  currentWk: number,
  getScores: PlayoffScoreProvider = defaultScoreProvider
): Promise<void> {
  const rounds = playoffRoundsCount(settings.season.playoffTeams)
  const regWeeks = settings.season.regularSeasonWeeks
  if (rounds === 0 || currentWk <= regWeeks) return

  const startWeek = settings.season.playoffStartWeek
  const finalWeek = startWeek + rounds - 1

  const matchups = await getFfMatchups(pool.id)
  const pairingsByRound = new Map<number, PlayoffPairing[]>()
  const memberBySeed = new Map<number, string>()
  for (const m of matchups) {
    if (!m.is_playoff || m.playoff_round === null || m.playoff_seed_home === null) continue
    const list = pairingsByRound.get(m.playoff_round) ?? []
    list.push({ homeSeed: m.playoff_seed_home, awaySeed: m.playoff_seed_away })
    pairingsByRound.set(m.playoff_round, list)
    memberBySeed.set(m.playoff_seed_home, m.home_member_id)
    if (m.playoff_seed_away !== null && m.away_member_id) {
      memberBySeed.set(m.playoff_seed_away, m.away_member_id)
    }
  }
  if (pairingsByRound.has(rounds)) return // bracket fully generated

  // Materialize lineups + score every week we might need (regular season for
  // seeding, completed playoff weeks for advancement)
  const scoreThrough = Math.min(currentWk, finalWeek)
  const weekScores = await getScores(pool, scoreThrough)
  const byWeek = new Map(weekScores.map((ws) => [ws.week, ws]))

  // Round 1: seed from final regular-season standings
  if (!pairingsByRound.has(1)) {
    for (let w = 1; w <= regWeeks; w++) {
      if (!byWeek.get(w)?.final) return
    }
    const { data: memberRows } = await admin
      .from('pool_members')
      .select('id')
      .eq('pool_id', pool.id)
    const results: FFMatchupResult[] = matchups
      .filter((m) => !m.is_playoff && m.week <= regWeeks)
      .map((m) => {
        const ws = byWeek.get(m.week)
        return {
          week: m.week,
          homeMemberId: m.home_member_id,
          awayMemberId: m.away_member_id,
          homeScore: ws?.scoreByMember.get(m.home_member_id) ?? 0,
          awayScore: m.away_member_id ? ws?.scoreByMember.get(m.away_member_id) ?? 0 : 0,
          final: ws?.final ?? false,
        }
      })
    const standings = computeStandings((memberRows ?? []).map((r) => r.id), results)
    const seedMembers = playoffSeeds(standings, settings.season.playoffTeams)
    if (seedMembers.length < 2) return
    seedMembers.forEach((memberId, i) => memberBySeed.set(i + 1, memberId))

    const pairings = roundPairings(seedMembers.map((_, i) => i + 1))
    await insertRound(admin, pool.id, 1, startWeek, pairings, memberBySeed)
    pairingsByRound.set(1, pairings)
  }

  // Advance rounds whose previous playoff week is final
  for (let r = 2; r <= rounds; r++) {
    if (pairingsByRound.has(r)) continue
    const prev = pairingsByRound.get(r - 1)
    if (!prev || prev.length === 0) return
    const prevWeek = startWeek + r - 2
    const ws = byWeek.get(prevWeek)
    if (!ws?.final) return

    const scoreForSeed = (seed: number) =>
      ws.scoreByMember.get(memberBySeed.get(seed) ?? '') ?? 0
    const winners = prev.map((p) =>
      pairingWinner(p, scoreForSeed(p.homeSeed), p.awaySeed !== null ? scoreForSeed(p.awaySeed) : 0)
    )
    const pairings = roundPairings(winners)
    await insertRound(admin, pool.id, r, prevWeek + 1, pairings, memberBySeed)
    pairingsByRound.set(r, pairings)
  }
}

async function insertRound(
  admin: Admin,
  poolId: string,
  round: number,
  week: number,
  pairings: PlayoffPairing[],
  memberBySeed: Map<number, string>
) {
  const rows = pairings
    .filter((p) => memberBySeed.has(p.homeSeed))
    .map((p) => ({
      pool_id: poolId,
      week,
      home_member_id: memberBySeed.get(p.homeSeed)!,
      away_member_id: p.awaySeed !== null ? memberBySeed.get(p.awaySeed) ?? null : null,
      is_playoff: true,
      playoff_round: round,
      playoff_seed_home: p.homeSeed,
      playoff_seed_away: p.awaySeed,
    }))
  if (rows.length === 0) return
  await admin
    .from('ff_matchups')
    .upsert(rows, { onConflict: 'pool_id,week,home_member_id', ignoreDuplicates: true })
}

/** The champion's member id, or null until the championship week is final. */
export function playoffChampion(
  playoffMatchups: FFMatchup[],
  settings: FFLeagueSettings,
  championshipFinal: boolean,
  scoreByMember: Map<string, number>
): string | null {
  const rounds = playoffRoundsCount(settings.season.playoffTeams)
  if (rounds === 0 || !championshipFinal) return null
  const finals = playoffMatchups.filter((m) => m.playoff_round === rounds)
  if (finals.length !== 1) return null
  const m = finals[0]
  if (!m.away_member_id) return m.home_member_id
  const winnerSeed = pairingWinner(
    { homeSeed: m.playoff_seed_home ?? 0, awaySeed: m.playoff_seed_away ?? 0 },
    scoreByMember.get(m.home_member_id) ?? 0,
    scoreByMember.get(m.away_member_id) ?? 0
  )
  return winnerSeed === m.playoff_seed_home ? m.home_member_id : m.away_member_id
}
