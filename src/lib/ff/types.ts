// Fantasy football domain types — framework-agnostic

export type FFPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
export type FFSlot = FFPosition | 'FLEX' | 'BENCH' | 'IR'

export interface FFLeagueSettings {
  roster: {
    QB: number
    RB: number
    WR: number
    TE: number
    FLEX: number
    K: number
    DST: number
    BENCH: number
    IR: number
  }
  flexEligible: Array<'QB' | 'RB' | 'WR' | 'TE'>
  draft: {
    type: 'snake' | 'auction'
    /** null = no pick timer (untimed draft) */
    timerSeconds: number | null
    auctionBudget: number
    auctionBidSeconds: number
  }
  season: {
    regularSeasonWeeks: number
    playoffTeams: 2 | 4 | 6 | 8
    playoffStartWeek: number
  }
  waivers: {
    type: 'priority' | 'faab' | 'none'
    faabBudget: number
    /** Day of week claims process (0 = Sunday) */
    processDay: number
    /** Hour of day (UTC) claims process */
    processHourUTC: number
  }
  trades: {
    enabled: boolean
    /** null = no deadline */
    deadlineWeek: number | null
    review: 'none' | 'commissioner'
  }
}

/**
 * Best ball league settings — stored in pools.ff_league_settings for
 * game_type 'ff_bestball'. Shape is deliberately disjoint from
 * FFLeagueSettings (no waivers/trades/BENCH) so resolveLeagueSettings can
 * sniff which schema a pool uses.
 */
export interface FFBestBallSettings {
  /** Starting lineup template only — bench is implied by totalRosterSize */
  roster: {
    QB: number
    RB: number
    WR: number
    TE: number
    FLEX: number
    K: number
    DST: number
  }
  flexEligible: Array<'QB' | 'RB' | 'WR' | 'TE'>
  /** Total players drafted per manager (= snake draft rounds) */
  totalRosterSize: number
  draft: FFLeagueSettings['draft']
  /** 'total' = season-long points leaderboard; 'h2h' = weekly matchups + playoffs */
  format: 'total' | 'h2h'
  season: FFLeagueSettings['season']
}

export interface FFScoringSettings {
  passYdsPerPoint: number
  passTd: number
  passInt: number
  pass2pt: number
  rushYdsPerPoint: number
  rushTd: number
  rush2pt: number
  /** Points per reception (1 = PPR, 0.5 = half PPR, 0 = standard) */
  reception: number
  recYdsPerPoint: number
  recTd: number
  rec2pt: number
  fumbleLost: number
  fg0to39: number
  fg40to49: number
  fg50plus: number
  fgMiss: number
  xp: number
  xpMiss: number
  dst: {
    sack: number
    interception: number
    fumbleRecovery: number
    td: number
    safety: number
    blockedKick: number
    /** Ordered ascending by max; first tier whose max >= points allowed applies. max null = catch-all */
    pointsAllowedTiers: Array<{ max: number | null; points: number }>
  }
}

export interface FFPlayer {
  id: string
  name: string
  first_name: string | null
  last_name: string | null
  position: FFPosition
  nfl_team_id: string | null
  nfl_team_abbrev: string | null
  jersey: string | null
  headshot_url: string | null
  status: string | null
  injury_status: string | null
  default_rank: number | null
  rank_espn: number | null
  rank_yahoo: number | null
  rank_sleeper: number | null
  rank_fantasypros: number | null
  /** Mean of available source ranks; drives default_rank (draft order) */
  rank_composite: number | null
  /** Manual admin override; wins over rank_composite when set */
  rank_composite_override: number | null
  active: boolean
  fetched_at: string
}

export interface FFNflGame {
  id: string
  season_year: number
  week: number
  season_type: number
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'in_progress' | 'final'
  status_detail: string | null
  start_time: string
  broadcasts: unknown
  fetched_at: string
}

/** Canonical stat keys produced by the NFL stat-map */
export interface FFStatLine {
  pass_yd?: number
  pass_td?: number
  pass_int?: number
  pass_2pt?: number
  rush_yd?: number
  rush_td?: number
  rush_2pt?: number
  rec?: number
  rec_yd?: number
  rec_td?: number
  rec_2pt?: number
  fum_lost?: number
  fg_0_39?: number
  fg_40_49?: number
  fg_50_plus?: number
  fg_miss?: number
  xp?: number
  xp_miss?: number
  dst_sack?: number
  dst_int?: number
  dst_fum_rec?: number
  dst_td?: number
  dst_safety?: number
  dst_blocked_kick?: number
  dst_points_allowed?: number
}

export interface FFPlayerStats {
  player_id: string
  season_year: number
  week: number
  nfl_game_id: string | null
  stats: FFStatLine
  fetched_at: string
}

export interface FFRosterEntry {
  id: string
  pool_id: string
  member_id: string
  player_id: string
  acquired_via: 'draft' | 'waiver' | 'free_agent' | 'trade' | 'commissioner'
  acquisition_cost: number | null
  acquired_at: string
}

export interface FFLineupSlot {
  id: string
  pool_id: string
  member_id: string
  week: number
  slot: FFSlot
  slot_index: number
  player_id: string | null
  locked_score: number | null
  updated_at: string
}

export interface FFMatchup {
  id: string
  pool_id: string
  week: number
  home_member_id: string
  away_member_id: string | null
  is_playoff: boolean
  playoff_round: number | null
  playoff_seed_home: number | null
  playoff_seed_away: number | null
  created_at: string
}

export interface FFDraftState {
  pool_id: string
  draft_type: 'snake' | 'auction'
  status: 'pre_draft' | 'in_progress' | 'paused' | 'completed'
  current_round: number
  current_pick_number: number
  current_member_id: string | null
  timer_seconds: number | null
  pick_deadline: string | null
  nominating_member_id: string | null
  nomination_number: number
  lot_player_id: string | null
  lot_high_bid: number | null
  lot_high_bidder_id: string | null
  lot_deadline: string | null
  updated_at: string
}

export interface FFDraftPick {
  id: string
  pool_id: string
  member_id: string
  round: number | null
  pick_number: number
  player_id: string
  player_name: string
  player_position: FFPosition
  price: number | null
  auto: boolean
  picked_at: string
}

export interface FFAuctionBid {
  id: string
  pool_id: string
  nomination_number: number
  member_id: string
  player_id: string
  amount: number
  created_at: string
}

export interface FFAuctionBudget {
  pool_id: string
  member_id: string
  budget: number
  spent: number
}

export interface FFWaiverState {
  pool_id: string
  next_process_at: string | null
  processing: boolean
  processing_claimed_at: string | null
  updated_at: string
}

export interface FFWaiverPriority {
  pool_id: string
  member_id: string
  priority: number
  faab_spent: number
}

export type FFWaiverClaimStatus = 'pending' | 'won' | 'lost' | 'cancelled' | 'invalid'

export interface FFWaiverClaim {
  id: string
  pool_id: string
  member_id: string
  add_player_id: string
  drop_player_id: string | null
  bid: number
  claim_order: number
  status: FFWaiverClaimStatus
  resolution: string | null
  created_at: string
  processed_at: string | null
}

export interface FFPlayerWaiver {
  pool_id: string
  player_id: string
  clears_at: string
}

export type FFTradeStatus =
  | 'proposed'
  | 'accepted' // awaiting commissioner review
  | 'rejected'
  | 'cancelled'
  | 'vetoed'
  | 'executed'

export interface FFTrade {
  id: string
  pool_id: string
  proposer_member_id: string
  recipient_member_id: string
  proposer_player_ids: string[]
  recipient_player_ids: string[]
  status: FFTradeStatus
  resolution: string | null
  created_at: string
  responded_at: string | null
  executed_at: string | null
}

export type FFTransactionType =
  | 'free_agent_add'
  | 'drop'
  | 'waiver_claim'
  | 'trade'
  | 'commissioner'

export interface FFTransaction {
  id: string
  pool_id: string
  member_id: string | null
  type: FFTransactionType
  detail: {
    add?: { id: string; name: string; position: string }
    drop?: { id: string; name: string; position: string }
    bid?: number
    note?: string
  }
  created_at: string
}
