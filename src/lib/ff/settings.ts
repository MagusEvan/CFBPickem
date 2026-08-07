// FF league/scoring settings: zod schemas, defaults, and resolution helpers.
// Client-safe (no server-only imports) so creation forms can share defaults.

import { z } from 'zod'
import type { Pool } from '@/lib/types'
import type { FFBestBallSettings, FFLeagueSettings, FFScoringSettings } from './types'

export const ffLeagueSettingsSchema = z.object({
  roster: z.object({
    QB: z.number().int().min(0).max(4),
    RB: z.number().int().min(0).max(8),
    WR: z.number().int().min(0).max(8),
    TE: z.number().int().min(0).max(4),
    FLEX: z.number().int().min(0).max(4),
    K: z.number().int().min(0).max(2),
    DST: z.number().int().min(0).max(2),
    BENCH: z.number().int().min(0).max(12),
    IR: z.number().int().min(0).max(4),
  }),
  flexEligible: z.array(z.enum(['QB', 'RB', 'WR', 'TE'])).min(1),
  draft: z.object({
    type: z.enum(['snake', 'auction']),
    timerSeconds: z.number().int().min(15).max(600).nullable(),
    auctionBudget: z.number().int().min(1).max(1000),
    auctionBidSeconds: z.number().int().min(5).max(120),
  }),
  season: z.object({
    regularSeasonWeeks: z.number().int().min(1).max(17),
    playoffTeams: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8)]),
    playoffStartWeek: z.number().int().min(2).max(18),
  }),
  waivers: z.object({
    type: z.enum(['priority', 'faab', 'none']),
    faabBudget: z.number().int().min(0).max(1000),
    processDay: z.number().int().min(0).max(6),
    processHourUTC: z.number().int().min(0).max(23),
  }),
  trades: z.object({
    enabled: z.boolean(),
    deadlineWeek: z.number().int().min(1).max(18).nullable(),
    review: z.enum(['none', 'commissioner']),
  }),
}) satisfies z.ZodType<FFLeagueSettings>

/** Sum of best ball starting-lineup slots */
export function bestBallStarters(roster: FFBestBallSettings['roster']): number {
  return roster.QB + roster.RB + roster.WR + roster.TE + roster.FLEX + roster.K + roster.DST
}

// Deliberately disjoint from ffLeagueSettingsSchema: best ball has
// totalRosterSize/format and no waivers/trades/BENCH/IR, so resolveLeagueSettings
// can sniff which shape a pool's ff_league_settings JSONB holds. z.object is
// non-strict, so require the discriminating fields and let the ff schema's
// required waivers/trades keep an ff payload from parsing here (and vice versa).
export const ffBestBallSettingsSchema = z.object({
  roster: z.object({
    QB: z.number().int().min(0).max(4),
    RB: z.number().int().min(0).max(8),
    WR: z.number().int().min(0).max(8),
    TE: z.number().int().min(0).max(4),
    FLEX: z.number().int().min(0).max(4),
    K: z.number().int().min(0).max(2),
    DST: z.number().int().min(0).max(2),
  }),
  flexEligible: z.array(z.enum(['QB', 'RB', 'WR', 'TE'])).min(1),
  totalRosterSize: z.number().int().min(1).max(30),
  draft: z.object({
    type: z.enum(['snake', 'auction']),
    timerSeconds: z.number().int().min(15).max(600).nullable(),
    auctionBudget: z.number().int().min(1).max(1000),
    auctionBidSeconds: z.number().int().min(5).max(120),
  }),
  format: z.enum(['total', 'h2h']),
  season: z.object({
    regularSeasonWeeks: z.number().int().min(1).max(17),
    playoffTeams: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8)]),
    playoffStartWeek: z.number().int().min(2).max(18),
  }),
  // Site-admin-only season replay; optional so real pools are unaffected
  test: z.object({ simulatedWeek: z.number().int().min(1).max(19) }).optional(),
}).refine(
  (s) => s.totalRosterSize >= bestBallStarters(s.roster),
  { message: 'Total roster size must be at least the number of starting slots' }
) satisfies z.ZodType<FFBestBallSettings>

export const ffScoringSettingsSchema = z.object({
  passYdsPerPoint: z.number().min(0),
  passTd: z.number(),
  passInt: z.number(),
  pass2pt: z.number(),
  rushYdsPerPoint: z.number().min(0),
  rushTd: z.number(),
  rush2pt: z.number(),
  reception: z.number(),
  recYdsPerPoint: z.number().min(0),
  recTd: z.number(),
  rec2pt: z.number(),
  fumbleLost: z.number(),
  fg0to39: z.number(),
  fg40to49: z.number(),
  fg50plus: z.number(),
  fgMiss: z.number(),
  xp: z.number(),
  xpMiss: z.number(),
  dst: z.object({
    sack: z.number(),
    interception: z.number(),
    fumbleRecovery: z.number(),
    td: z.number(),
    safety: z.number(),
    blockedKick: z.number(),
    pointsAllowedTiers: z.array(
      z.object({ max: z.number().nullable(), points: z.number() })
    ).min(1),
  }),
}) satisfies z.ZodType<FFScoringSettings>

export const DEFAULT_FF_LEAGUE_SETTINGS: FFLeagueSettings = {
  roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6, IR: 1 },
  flexEligible: ['RB', 'WR', 'TE'],
  draft: { type: 'snake', timerSeconds: 90, auctionBudget: 200, auctionBidSeconds: 15 },
  season: { regularSeasonWeeks: 14, playoffTeams: 4, playoffStartWeek: 15 },
  waivers: { type: 'faab', faabBudget: 100, processDay: 3, processHourUTC: 8 },
  trades: { enabled: true, deadlineWeek: 11, review: 'none' },
}

export const DEFAULT_FF_BESTBALL_SETTINGS: FFBestBallSettings = {
  roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 },
  flexEligible: ['RB', 'WR', 'TE'],
  totalRosterSize: 15,
  draft: { type: 'snake', timerSeconds: 90, auctionBudget: 200, auctionBidSeconds: 15 },
  format: 'total',
  season: { regularSeasonWeeks: 17, playoffTeams: 4, playoffStartWeek: 15 },
}

export const DEFAULT_FF_SCORING_SETTINGS: FFScoringSettings = {
  // Standard PPR
  passYdsPerPoint: 25,
  passTd: 4,
  passInt: -2,
  pass2pt: 2,
  rushYdsPerPoint: 10,
  rushTd: 6,
  rush2pt: 2,
  reception: 1,
  recYdsPerPoint: 10,
  recTd: 6,
  rec2pt: 2,
  fumbleLost: -2,
  fg0to39: 3,
  fg40to49: 4,
  fg50plus: 5,
  fgMiss: -1,
  xp: 1,
  xpMiss: -1,
  dst: {
    sack: 1,
    interception: 2,
    fumbleRecovery: 2,
    td: 6,
    safety: 2,
    blockedKick: 2,
    pointsAllowedTiers: [
      { max: 0, points: 10 },
      { max: 6, points: 7 },
      { max: 13, points: 4 },
      { max: 20, points: 1 },
      { max: 27, points: 0 },
      { max: 34, points: -1 },
      { max: null, points: -4 },
    ],
  },
}

/**
 * Adapt best ball settings to the FFLeagueSettings shape all draft code
 * consumes: the undrafted remainder becomes BENCH, no IR, waivers/trades off.
 * In-memory only — never persisted or re-validated against
 * ffLeagueSettingsSchema (whose BENCH max would not apply).
 */
export function bestBallToLeagueSettings(bb: FFBestBallSettings): FFLeagueSettings {
  return {
    roster: {
      ...bb.roster,
      BENCH: Math.max(0, bb.totalRosterSize - bestBallStarters(bb.roster)),
      IR: 0,
    },
    flexEligible: bb.flexEligible,
    draft: bb.draft,
    season: bb.season,
    waivers: { type: 'none', faabBudget: 0, processDay: 3, processHourUTC: 8 },
    trades: { enabled: false, deadlineWeek: null, review: 'none' },
  }
}

/**
 * Parse a pool's JSONB settings, falling back to defaults for missing config.
 * Shape-sniffing: a best ball payload (disjoint schema) is adapted to the
 * league-settings shape so draft code works unchanged for both game types.
 */
export function resolveLeagueSettings(
  pool: Pick<Pool, 'ff_league_settings'>
): FFLeagueSettings {
  const bb = ffBestBallSettingsSchema.safeParse(pool.ff_league_settings)
  if (bb.success) return bestBallToLeagueSettings(bb.data)
  const parsed = ffLeagueSettingsSchema.safeParse(pool.ff_league_settings)
  return parsed.success ? parsed.data : DEFAULT_FF_LEAGUE_SETTINGS
}

/** NFL season year for "now" (Jan/Feb still belong to the prior season). */
export function currentNflSeasonYear(now = new Date()): number {
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear()
}

/** Simulated week when test mode is active, else null */
export function bestBallSimulatedWeek(bb: FFBestBallSettings): number | null {
  return bb.test?.simulatedWeek ?? null
}

/** Parse a best ball pool's settings (call only for game_type 'ff_bestball'). */
export function resolveBestBallSettings(
  pool: Pick<Pool, 'ff_league_settings'>
): FFBestBallSettings {
  const parsed = ffBestBallSettingsSchema.safeParse(pool.ff_league_settings)
  return parsed.success ? parsed.data : DEFAULT_FF_BESTBALL_SETTINGS
}

export function resolveScoringSettings(
  pool: Pick<Pool, 'ff_scoring_settings'>
): FFScoringSettings {
  const parsed = ffScoringSettingsSchema.safeParse(pool.ff_scoring_settings)
  return parsed.success ? parsed.data : DEFAULT_FF_SCORING_SETTINGS
}

/** Total roster spots (draft rounds for snake = this number, excluding IR) */
export function totalRosterSpots(settings: FFLeagueSettings): number {
  const r = settings.roster
  return r.QB + r.RB + r.WR + r.TE + r.FLEX + r.K + r.DST + r.BENCH
}
