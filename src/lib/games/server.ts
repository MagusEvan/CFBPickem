// Server-side game registry — pool-creation parsing and game-data refresh,
// keyed by GameType. Client-safe metadata lives in ./registry.ts.

import { z } from 'zod'
import type { GameType } from '@/lib/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { GAMES, TOTAL_WC_TEAMS } from './registry'
import {
  ffBestBallSettingsSchema,
  ffLeagueSettingsSchema,
  ffScoringSettingsSchema,
} from '@/lib/ff/settings'

type Admin = ReturnType<typeof createAdminClient>

export interface GameServerDefinition {
  key: GameType
  /**
   * Parse and validate a pool-creation form, returning the game-specific
   * pool insert fields (name, season_year, max_managers, draft_order_mode,
   * game_type, scoring_strategy, num_rounds, conferences, teams_per_manager,
   * scoring_config). Caller adds admin_id and invite_code.
   */
  parsePoolInsert: (formData: FormData) => Record<string, unknown>
  /**
   * Refresh cached game data from the external provider for a season.
   * null = game has no pool-level game feed (PGA refreshes per tournament).
   */
  refreshGames: ((admin: Admin, seasonYear: number) => Promise<void>) | null
  /**
   * Optional hook run after a pool is inserted (and the admin has joined),
   * for seeding game-specific child rows (e.g. FF draft state).
   */
  afterPoolCreate?: (admin: Admin, pool: { id: string }) => Promise<void>
}

// --- Shared creation-form parsing ---

function baseSchema(gameType: GameType) {
  const { min, max } = GAMES[gameType].maxManagers
  return z.object({
    name: z.string().min(1).max(100),
    season_year: z.number().int().min(2024).max(2030),
    max_managers: z.number().int().min(min).max(max),
    draft_order_mode: z.enum(['manual', 'random']),
  })
}

function baseFormValues(formData: FormData) {
  return {
    name: formData.get('name'),
    season_year: Number(formData.get('season_year')),
    max_managers: Number(formData.get('max_managers')),
    draft_order_mode: formData.get('draft_order_mode') || 'random',
  }
}

const wcScoringConfigSchema = z.object({
  group: z.object({
    win: z.number(), draw: z.number(), goal_points: z.number(),
    goal_cap: z.number(), shutout: z.number(),
  }),
  knockout: z.object({
    win: z.number(), ot_win: z.number(), shootout_win: z.number(),
    shootout_loss: z.number(), ot_loss: z.number(), loss: z.number(),
    goal_points: z.number(), goal_cap: z.number().nullable(), shutout: z.number(),
  }),
})

// --- Refresh implementations ---

async function refreshCfbGames(admin: Admin, seasonYear: number): Promise<void> {
  // Always use ESPN for games — CFBD does not provide live/in-progress scores
  const { EspnProvider } = await import('@/lib/data-providers/espn/provider')
  const provider = new EspnProvider()

  // Only fetch weeks that have games that have started but aren't final.
  // ESPN returns ~100 games per week, so we avoid fetching weeks with no live action.
  const now = new Date()
  const { data: liveWeeks } = await admin
    .from('cached_games')
    .select('week')
    .eq('season_year', seasonYear)
    .not('week', 'is', null)
    .neq('status', 'final')
    .lte('start_time', now.toISOString())
  const activeWeekSet = new Set((liveWeeks ?? []).map((r: { week: number }) => r.week))

  // Bootstrap: if no cached data at all, fetch week 1
  if (activeWeekSet.size === 0) {
    const { count } = await admin
      .from('cached_games')
      .select('id', { count: 'exact', head: true })
      .eq('season_year', seasonYear)
      .not('week', 'is', null)
    if (!count || count === 0) activeWeekSet.add(1)
  }

  const weeks = [...activeWeekSet].sort((a, b) => a - b)

  if (weeks.length > 0) {
    const allGames = []
    for (const week of weeks) {
      const games = await provider.getGamesForWeek(seasonYear, week)
      allGames.push(...games)
    }

    const fetchedAt = new Date().toISOString()
    const rows = allGames.map((g) => ({
      id: g.id,
      season_year: g.seasonYear,
      week: g.week,
      home_team_id: g.homeTeam.id,
      away_team_id: g.awayTeam.id,
      home_team_name: g.homeTeam.name,
      away_team_name: g.awayTeam.name,
      home_score: g.homeTeam.score,
      away_score: g.awayTeam.score,
      status: g.status,
      status_detail: g.statusDetail,
      start_time: g.startTime,
      venue: g.venue,
      broadcasts: g.broadcasts.length > 0 ? g.broadcasts : null,
      fetched_at: fetchedAt,
    }))

    if (rows.length > 0) {
      const { error } = await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
      if (error) throw new Error(`DB upsert failed: ${error.message}`)
    }
  }

  // Derive win/loss records from final games in the DB (ESPN standings
  // endpoint is empty early in the season)
  await updateTeamRecordsFromGames(admin, seasonYear)
}

async function updateTeamRecordsFromGames(admin: Admin, seasonYear: number) {
  // Get all final CFB games and compute records from results
  const { data: finalGames } = await admin
    .from('cached_games')
    .select('home_team_id, away_team_id, home_score, away_score')
    .eq('season_year', seasonYear)
    .eq('status', 'final')
    .not('week', 'is', null) // CFB games have weeks; WC games don't
  if (!finalGames || finalGames.length === 0) return

  const records = new Map<string, { wins: number; losses: number }>()
  const ensure = (id: string) => {
    if (!records.has(id)) records.set(id, { wins: 0, losses: 0 })
    return records.get(id)!
  }

  for (const g of finalGames) {
    if (g.home_score == null || g.away_score == null) continue
    const home = ensure(g.home_team_id)
    const away = ensure(g.away_team_id)
    if (g.home_score > g.away_score) {
      home.wins++
      away.losses++
    } else if (g.away_score > g.home_score) {
      away.wins++
      home.losses++
    }
    // ties: neither incremented
  }

  // Only update teams we have cached
  const { data: cachedTeams } = await admin
    .from('cached_teams')
    .select('id')
    .eq('season_year', seasonYear)
    .eq('game_type', 'cfb')
  const cachedIds = new Set((cachedTeams ?? []).map((t) => t.id))

  const updates = [...records.entries()]
    .filter(([id]) => cachedIds.has(id))
    .map(([id, rec]) =>
      admin
        .from('cached_teams')
        .update({ wins: rec.wins, losses: rec.losses })
        .eq('id', id)
        .eq('season_year', seasonYear)
    )

  if (updates.length > 0) await Promise.all(updates)
}

async function refreshWcGames(admin: Admin, seasonYear: number): Promise<void> {
  const { getWorldCupProvider } = await import('@/lib/data-providers/world-cup/provider')
  const provider = getWorldCupProvider()
  const games = await provider.getAllGames(seasonYear)

  const rows = games.map((g) => ({
    id: g.id,
    season_year: seasonYear,
    week: null,
    home_team_id: g.homeTeam.id,
    away_team_id: g.awayTeam.id,
    home_team_name: g.homeTeam.name,
    away_team_name: g.awayTeam.name,
    home_score: g.homeTeam.score,
    away_score: g.awayTeam.score,
    status: g.status,
    status_detail: g.statusDetail,
    start_time: g.startTime,
    venue: g.venue,
    game_type: 'world_cup' as const,
    stage: g.stage,
    is_overtime: g.isOvertime,
    is_shootout: g.isShootout,
    home_penalty_score: g.homePenaltyScore,
    away_penalty_score: g.awayPenaltyScore,
    manual_entry: false,
    broadcasts: g.broadcasts.length > 0 ? g.broadcasts : null,
    fetched_at: new Date().toISOString(),
  }))

  if (rows.length > 0) {
    const { error } = await admin.from('cached_games').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`DB upsert failed: ${error.message}`)
  }
}

// --- Registry ---

export const GAME_SERVERS: Record<GameType, GameServerDefinition> = {
  cfb: {
    key: 'cfb',
    parsePoolInsert: (formData) => {
      const input = baseSchema('cfb').extend({
        conferences: z.array(z.string()).min(1).max(15),
      }).parse({
        ...baseFormValues(formData),
        conferences: formData.getAll('conferences'),
      })
      return {
        ...input,
        game_type: 'cfb',
        scoring_strategy: 'wins_only',
        num_rounds: input.conferences.length,
      }
    },
    refreshGames: refreshCfbGames,
  },
  world_cup: {
    key: 'world_cup',
    parsePoolInsert: (formData) => {
      const input = baseSchema('world_cup').extend({
        teams_per_manager: z.number().int().min(1),
        scoring_config: wcScoringConfigSchema,
      }).refine(
        (d) => d.max_managers * d.teams_per_manager <= TOTAL_WC_TEAMS,
        { message: `Managers × teams per manager must not exceed ${TOTAL_WC_TEAMS}` }
      ).parse({
        ...baseFormValues(formData),
        teams_per_manager: Number(formData.get('teams_per_manager')),
        scoring_config: JSON.parse(formData.get('scoring_config') as string),
      })
      return {
        ...input,
        game_type: 'world_cup',
        scoring_strategy: 'world_cup',
        conferences: null,
        num_rounds: input.teams_per_manager,
      }
    },
    refreshGames: refreshWcGames,
  },
  pga: {
    key: 'pga',
    parsePoolInsert: (formData) => {
      const input = baseSchema('pga').parse(baseFormValues(formData))
      return {
        ...input,
        game_type: 'pga',
        scoring_strategy: 'pga',
        conferences: null,
        num_rounds: 0,
        teams_per_manager: null,
        scoring_config: null,
      }
    },
    refreshGames: null,
  },
  ff: {
    key: 'ff',
    parsePoolInsert: (formData) => {
      const input = baseSchema('ff').extend({
        ff_league_settings: ffLeagueSettingsSchema,
        ff_scoring_settings: ffScoringSettingsSchema,
      }).parse({
        ...baseFormValues(formData),
        ff_league_settings: JSON.parse(formData.get('ff_league_settings') as string),
        ff_scoring_settings: JSON.parse(formData.get('ff_scoring_settings') as string),
      })
      return {
        ...input,
        game_type: 'ff',
        scoring_strategy: 'ff',
        conferences: null,
        num_rounds: 0,
        teams_per_manager: null,
        scoring_config: null,
      }
    },
    // Wired to the NFL data provider in src/lib/ff/refresh.ts (Phase 2)
    refreshGames: null,
    afterPoolCreate: async (admin, pool) => {
      const { error } = await admin
        .from('ff_draft_state')
        .insert({ pool_id: pool.id })
      if (error) throw new Error(`Failed to seed FF draft state: ${error.message}`)
    },
  },
  ff_bestball: {
    key: 'ff_bestball',
    parsePoolInsert: (formData) => {
      const input = baseSchema('ff_bestball').extend({
        ff_league_settings: ffBestBallSettingsSchema,
        ff_scoring_settings: ffScoringSettingsSchema,
      }).parse({
        ...baseFormValues(formData),
        ff_league_settings: JSON.parse(formData.get('ff_league_settings') as string),
        ff_scoring_settings: JSON.parse(formData.get('ff_scoring_settings') as string),
      })
      return {
        ...input,
        game_type: 'ff_bestball',
        scoring_strategy: 'ff',
        conferences: null,
        num_rounds: 0,
        teams_per_manager: null,
        scoring_config: null,
      }
    },
    // Shares the FF data feed; freshness is triggered per page like ff
    refreshGames: null,
    afterPoolCreate: async (admin, pool) => {
      const { error } = await admin
        .from('ff_draft_state')
        .insert({ pool_id: pool.id })
      if (error) throw new Error(`Failed to seed FF draft state: ${error.message}`)
    },
  },
}
