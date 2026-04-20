// Domain types — framework-agnostic, portable to React Native

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
  conferences: string[]
  num_rounds: number
  scoring_strategy: string
  draft_status: 'pre_draft' | 'in_progress' | 'completed'
  draft_order_mode: 'manual' | 'random'
  created_at: string
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
  fetched_at: string
}

export interface CachedGame {
  id: string
  season_year: number
  week: number
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'in_progress' | 'final'
  start_time: string | null
  venue: string | null
  fetched_at: string
}
