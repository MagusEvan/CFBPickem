// Game registry — the single source of truth for per-game-type behavior.
// Client-safe: no server-only imports. Server-side behavior (pool creation
// parsing, data refresh) lives in ./server.ts, keyed by the same GameType.
//
// When adding a new game type: add its entry here and in ./server.ts, and
// the pool-creation flow, labels, and draft round logic pick it up. Pages
// with genuinely game-specific UI (standings, schedule) still branch locally.

import type { GameType, WorldCupScoringConfig } from '@/lib/types'

export interface GameDefinition {
  key: GameType
  /** Display name, e.g. "College Football" */
  name: string
  /** One-line pitch shown on the game-selection step of pool creation */
  description: string
  /** Placeholder for the pool name input */
  namePlaceholder: string
  /** Label for the season/tournament year input */
  seasonYearLabel: string
  /** Description under the Schedule nav card ('' = game has no schedule page) */
  scheduleDescription: string
  maxManagers: { min: number; max: number }
  /** e.g. "World Cup 2026" / "2026 Season" — shown on dashboards and join page */
  poolLabel: (seasonYear: number) => string
  /** Number of draft rounds for a pool (0 = drafts are not pool-level) */
  numRounds: (pool: { teams_per_manager: number | null; conferences: string[] | null }) => number
}

export const GAMES: Record<GameType, GameDefinition> = {
  cfb: {
    key: 'cfb',
    name: 'College Football',
    description: 'Draft conferences and ride your teams all season',
    namePlaceholder: 'e.g. The Gridiron League',
    seasonYearLabel: 'Season Year',
    scheduleDescription: 'Weekly matchups',
    maxManagers: { min: 4, max: 16 },
    poolLabel: (year) => `${year} Season`,
    numRounds: (pool) => (pool.conferences ?? []).length,
  },
  world_cup: {
    key: 'world_cup',
    name: 'World Cup',
    description: 'Draft national teams through group stage and knockouts',
    namePlaceholder: 'e.g. World Cup 2026 Draft',
    seasonYearLabel: 'Tournament Year',
    scheduleDescription: 'Match schedule',
    maxManagers: { min: 2, max: 48 },
    poolLabel: (year) => `World Cup ${year}`,
    numRounds: (pool) => pool.teams_per_manager ?? 1,
  },
  pga: {
    key: 'pga',
    name: 'PGA Tour',
    description: 'Draft golfers tournament by tournament',
    namePlaceholder: 'e.g. Masters League 2026',
    seasonYearLabel: 'Tournament Year',
    scheduleDescription: '',
    maxManagers: { min: 2, max: 48 },
    poolLabel: (year) => `PGA Tour ${year}`,
    numRounds: () => 0, // PGA drafts happen per tournament, not per pool
  },
  ff: {
    key: 'ff',
    name: 'Fantasy Football',
    description: 'Draft NFL players and battle head-to-head every week',
    namePlaceholder: 'e.g. The League of Champions',
    seasonYearLabel: 'Season Year',
    scheduleDescription: 'Weekly matchups',
    maxManagers: { min: 4, max: 20 },
    poolLabel: (year) => `${year} Fantasy Season`,
    numRounds: () => 0, // FF drafts use ff_draft_state, not the shared pool draft
  },
}

/** Ordered list for the pool-creation game picker */
export const GAME_LIST: GameDefinition[] = [GAMES.cfb, GAMES.world_cup, GAMES.pga, GAMES.ff]

export function getGame(gameType: GameType): GameDefinition {
  return GAMES[gameType]
}

export function isGameType(value: unknown): value is GameType {
  return value === 'cfb' || value === 'world_cup' || value === 'pga' || value === 'ff'
}

// --- Game-specific pool-creation constants (client-safe) ---

export const CFB_CONFERENCES = [
  { key: 'ACC', name: 'ACC' },
  { key: 'B12', name: 'Big 12' },
  { key: 'B1G', name: 'Big Ten' },
  { key: 'SEC', name: 'SEC' },
  { key: 'AAC', name: 'American Athletic' },
  { key: 'CUSA', name: 'Conference USA' },
  { key: 'MAC', name: 'MAC' },
  { key: 'MW', name: 'Mountain West' },
  { key: 'SBC', name: 'Sun Belt' },
  { key: 'PAC12_IND', name: 'Pac-12 / Independent' },
]

export const TOTAL_WC_TEAMS = 48

export const DEFAULT_WC_SCORING: WorldCupScoringConfig = {
  group: { win: 6, draw: 3, goal_points: 1, goal_cap: 3, shutout: 1 },
  knockout: {
    win: 6, ot_win: 5, shootout_win: 4, shootout_loss: 2,
    ot_loss: 1, loss: 0, goal_points: 1, goal_cap: null, shutout: 1,
  },
}
