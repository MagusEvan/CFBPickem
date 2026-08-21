// Domain types — framework-agnostic, portable to React Native

export type GameType = 'cfb' | 'world_cup' | 'pga' | 'ff' | 'ff_bestball'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

export interface Pool {
  id: string
  name: string
  admin_id: string
  season_year: number
  invite_code: string
  max_managers: number
  conferences: string[] | null
  num_rounds: number
  scoring_strategy: string
  draft_status: 'pre_draft' | 'in_progress' | 'completed'
  draft_order_mode: 'manual' | 'random'
  game_type: GameType
  teams_per_manager: number | null
  scoring_config: WorldCupScoringConfig | null
  ff_league_settings: unknown | null
  ff_scoring_settings: unknown | null
  bg_color: string | null
  font_color: string | null
  subfont_color: string | null
  border_color: string | null
  counting_highlight_color: string | null
  created_at: string
}

export interface WorldCupScoringConfig {
  group: {
    win: number
    draw: number
    goal_points: number
    goal_cap: number
    shutout: number
  }
  knockout: {
    win: number
    ot_win: number
    shootout_win: number
    shootout_loss: number
    ot_loss: number
    loss: number
    goal_points: number
    goal_cap: number | null
    shutout: number
  }
}

export interface PoolMember {
  id: string
  pool_id: string
  user_id: string
  draft_position: number | null
  joined_at: string
  // joined from profiles
  profiles?: Profile
}

export interface Conference {
  key: string
  display_name: string
  cfbd_name: string | null
  espn_group_id: string | null
  is_depleting: boolean
  sort_order: number
}

export interface DraftPick {
  id: string
  pool_id: string
  member_id: string | null
  round: number
  pick_number: number
  conference_key: string
  team_id: string
  team_name: string
  is_bonus_pick: boolean
  bonus_conference_key: string | null
  picked_at: string
}

export interface DraftState {
  pool_id: string
  current_round: number
  current_pick_number: number
  current_member_id: string | null
  conference_key: string | null
  pac12_ind_depleted: boolean
  show_projections: boolean
  updated_at: string
}

export interface TeamScraps {
  id: string
  pool_id: string
  conference_key: string
  team_id: string
  team_name: string
  wins: number
  created_at: string
}

export interface WcScrapsTeam {
  id: string
  pool_id: string
  scraps_team_number: number
  team_id: string
  team_name: string
  created_at: string
}

export interface CachedTeam {
  id: string
  name: string
  abbreviation: string
  conference_key: string | null
  logo_url: string | null
  color_primary: string | null
  color_secondary: string | null
  season_year: number
  wins: number
  losses: number
  projected_wins: number | null
  game_type: GameType
  fetched_at: string
}

export interface GameBroadcast {
  network: string
  type: string      // "TV", "Web", "Radio"
  market: string    // "National", "Home", "Away"
  locale: string    // "us", "uk", "mx", etc.
}

export interface CachedGame {
  id: string
  season_year: number
  week: number | null
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'in_progress' | 'final'
  status_detail: string | null
  start_time: string | null
  venue: string | null
  game_type: GameType
  stage: string | null
  is_overtime: boolean
  is_shootout: boolean
  home_penalty_score: number | null
  away_penalty_score: number | null
  manual_entry: boolean
  broadcasts: GameBroadcast[] | null
  fetched_at: string
}

// PGA Types

export interface PgaTournament {
  id: string
  pool_id: string
  espn_event_id: string | null
  name: string
  season_year: number
  start_date: string | null
  end_date: string | null
  golfers_per_manager: number
  top_n_scoring: number
  enable_scraps: boolean
  draft_status: 'pre_draft' | 'in_progress' | 'completed'
  draft_order_mode: 'manual' | 'random'
  course_par: number
  missed_cut_score: number
  draft_type: 'snake' | 'calcutta'
  calcutta_settings: import('@/lib/pga/calcutta-types').CalcuttaSettings | null
  created_at: string
}

export interface PgaTournamentMember {
  id: string
  tournament_id: string
  pool_member_id: string
  draft_position: number | null
  // Joined
  pool_member?: PoolMember & { profiles: Profile }
}

export interface PgaGolfer {
  id: string
  tournament_id: string
  name: string
  amateur: boolean
  country: string | null
  image_url: string | null
  odds_draftkings: string | null
  odds_mgm: string | null
  odds_betonline: string | null
  calcutta_odds: number | null
  odds_source: string | null
  status: 'active' | 'cut' | 'withdrawn' | 'disqualified'
  position: string | null
  total_score: number | null
  total_strokes: number | null
  r1_score: number | null
  r2_score: number | null
  r3_score: number | null
  r4_score: number | null
  r1_strokes: number | null
  r2_strokes: number | null
  r3_strokes: number | null
  r4_strokes: number | null
  tee_time: string | null
  thru: string | null
  fetched_at: string
}

export interface PgaDraftState {
  tournament_id: string
  current_round: number
  current_pick_number: number
  current_member_id: string | null
  current_lot_id: string | null
  lot_high_bid: number | null
  lot_high_bidder_id: string | null
  lot_deadline: string | null
  auction_cycle: number
  updated_at: string
}

export interface PgaDraftPick {
  id: string
  tournament_id: string
  member_id: string
  round: number
  pick_number: number
  golfer_id: string
  golfer_name: string
  price: number | null
  lot_id: string | null
  picked_at: string
}

export interface PgaCalcuttaLot {
  id: string
  tournament_id: string
  lot_order: number
  kind: 'golfer' | 'scraps'
  label: string
  golfer_ids: string[]
  status: 'pending' | 'open' | 'sold' | 'unsold'
  winner_member_id: string | null
  price: number | null
  sold_at: string | null
}

export interface PgaCalcuttaBid {
  id: string
  tournament_id: string
  lot_id: string
  member_id: string
  amount: number
  created_at: string
}
