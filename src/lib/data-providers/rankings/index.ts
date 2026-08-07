// Public player-ranking sources for fantasy football draft prep.
//
//   ESPN        fantasy API kona_player_info (PPR draft rank), keyed by the
//               same ESPN athlete ids as ff_players
//   Yahoo       pub-api-ro draft_analysis (no auth required) sorted by
//               average draft pick; rank = ordinal ADP position, matched by
//               normalized name + position (DSTs by team abbreviation)
//   Sleeper     public players API search_rank, mapped via espn_id with a
//               name+position fallback (espn_id is null on most players
//               drafted since ~2021; DSTs keyed by team abbreviation)
//   FantasyPros expert-consensus rank scraped from the ecrData JSON embedded
//               in the PPR cheatsheet page, matched by normalized name +
//               position (DSTs by team abbreviation)
//
// Every fetcher returns Map<sourceKey, {rank, ...market data}>; mapping to
// ff_players rows happens in src/lib/ff/rankings.ts. The market fields (ADP,
// auction value, ownership, projections, tiers, injury notes) ride along in
// the same responses the rank fetches were already downloading.

const TIMEOUT_MS = 15_000

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${new URL(url).hostname} error: ${res.status} ${res.statusText}`)
  return res.json()
}

// ============================================================
// ESPN
// ============================================================

interface EspnRankedPlayer {
  player?: {
    id: number
    defaultPositionId?: number
    proTeamId?: number
    draftRanksByRankType?: { PPR?: { rank?: number } }
    ownership?: {
      percentOwned?: number
      averageDraftPosition?: number
      auctionValueAverage?: number
    }
    stats?: Array<{
      seasonId?: number
      statSourceId?: number
      statSplitTypeId?: number
      appliedTotal?: number
    }>
  }
}

export interface EspnPlayerData {
  rank: number
  adp: number | null
  auctionValue: number | null
  percentOwned: number | null
  projSeasonPts: number | null
}

export interface EspnRanks {
  /** ESPN athlete id (= ff_players.id) -> PPR draft rank + market data */
  byAthleteId: Map<string, EspnPlayerData>
  /** D/ST entries: ESPN pro-team id (= ff_players.nfl_team_id) -> data */
  dstByTeamId: Map<string, EspnPlayerData>
}

const ESPN_DST_POSITION_ID = 16

export async function fetchEspnRanks(seasonYear: number, limit = 500): Promise<EspnRanks> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${seasonYear}/segments/0/leaguedefaults/3?view=kona_player_info`
  const filter = {
    players: { limit, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'PPR' } },
  }
  const data = await fetchJson<{ players?: EspnRankedPlayer[] }>(url, {
    'X-Fantasy-Filter': JSON.stringify(filter),
  })

  const byAthleteId = new Map<string, EspnPlayerData>()
  const dstByTeamId = new Map<string, EspnPlayerData>()
  for (const entry of data.players ?? []) {
    const p = entry.player
    const rank = p?.draftRanksByRankType?.PPR?.rank
    if (!p || typeof rank !== 'number') continue

    // statSourceId 1 = projection, statSplitTypeId 0 = full season
    const projection = p.stats?.find(
      (s) =>
        s.statSourceId === 1 &&
        s.statSplitTypeId === 0 &&
        (s.seasonId === undefined || s.seasonId === seasonYear)
    )
    const round1 = (n: number | undefined): number | null =>
      typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null
    const value: EspnPlayerData = {
      rank,
      adp: round1(p.ownership?.averageDraftPosition),
      auctionValue: round1(p.ownership?.auctionValueAverage),
      percentOwned: round1(p.ownership?.percentOwned),
      projSeasonPts: round1(projection?.appliedTotal),
    }

    if (p.defaultPositionId === ESPN_DST_POSITION_ID) {
      if (p.proTeamId) dstByTeamId.set(String(p.proTeamId), value)
    } else {
      byAthleteId.set(String(p.id), value)
    }
  }
  return { byAthleteId, dstByTeamId }
}

// ============================================================
// Yahoo
// ============================================================

interface YahooPlayerWrapper {
  player?: {
    name?: { full?: string }
    display_position?: string
    editorial_team_abbr?: string
    // Yahoo serializes these as strings; missing values come back as "-"
    draft_analysis?: {
      average_pick?: string
      average_cost?: string
      percent_drafted?: string
    }
  }
}

export interface YahooPlayerData {
  rank: number
  averagePick: number | null
  averageCost: number | null
  percentDrafted: number | null
}

export interface YahooRanks {
  /** normalized "name|position" -> ADP-order rank + draft analysis */
  byNamePosition: Map<string, YahooPlayerData>
  /** DEF entries: ESPN-style team abbreviation -> data */
  dstByTeamAbbrev: Map<string, YahooPlayerData>
}

/** Yahoo team abbrevs that differ from ESPN's once uppercased. */
const YAHOO_TO_ESPN_ABBREV: Record<string, string> = { WAS: 'WSH' }

/** Yahoo numeric strings: "23.4" -> 23.4, "-"/missing -> null. */
function yahooNum(v: string | undefined): number | null {
  if (v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function fetchYahooRanks(limit = 300): Promise<YahooRanks> {
  const url = `https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2/game/nfl/players;start=0;count=${limit};sort=DA_AP/draft_analysis?format=json_f`
  const data = await fetchJson<{
    fantasy_content?: { game?: { players?: YahooPlayerWrapper[] } }
  }>(url, { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })

  const byNamePosition = new Map<string, YahooPlayerData>()
  const dstByTeamAbbrev = new Map<string, YahooPlayerData>()
  const players = data.fantasy_content?.game?.players ?? []
  players.forEach((entry, i) => {
    const p = entry.player
    // multi-eligible players read like "WR,RB" — first listed is primary
    const position = p?.display_position?.split(',')[0]?.trim()
    if (!p || !position) return
    const value: YahooPlayerData = {
      rank: i + 1, // list is ADP-sorted; rank = ordinal position
      averagePick: yahooNum(p.draft_analysis?.average_pick),
      // percent_drafted arrives as a 0-1 fraction — store 0-100
      percentDrafted:
        yahooNum(p.draft_analysis?.percent_drafted) !== null
          ? Math.round(yahooNum(p.draft_analysis?.percent_drafted)! * 1000) / 10
          : null,
      averageCost: yahooNum(p.draft_analysis?.average_cost),
    }
    if (position === 'DEF') {
      const abbrev = p.editorial_team_abbr?.toUpperCase()
      if (abbrev) dstByTeamAbbrev.set(YAHOO_TO_ESPN_ABBREV[abbrev] ?? abbrev, value)
    } else if (p.name?.full) {
      byNamePosition.set(namePositionKey(p.name.full, position), value)
    }
  })
  if (byNamePosition.size === 0) throw new Error('Yahoo: no ranked players returned')
  return { byNamePosition, dstByTeamAbbrev }
}

// ============================================================
// Sleeper
// ============================================================

interface SleeperPlayer {
  player_id: string
  full_name?: string | null
  position?: string | null
  espn_id?: number | null
  search_rank?: number | null
  active?: boolean
  injury_notes?: string | null
  injury_body_part?: string | null
  depth_chart_position?: string | null
  depth_chart_order?: number | null
  /** ms epoch */
  news_updated?: number | null
}

const SLEEPER_UNRANKED = 9_999_999

export interface SleeperPlayerData {
  rank: number
  /** Injury note with body part prefix, e.g. "Hamstring — questionable..." */
  injuryNote: string | null
  depthChartPosition: string | null
  depthChartOrder: number | null
  /** ISO timestamp */
  newsUpdated: string | null
}

export interface SleeperRanks {
  /** ESPN athlete id -> Sleeper search_rank + injury/depth data */
  byEspnId: Map<string, SleeperPlayerData>
  /**
   * normalized "name|position" -> data, fallback for the many Sleeper
   * entries (most players drafted since ~2021) whose espn_id is null.
   * On a name+position collision the better (lower) rank wins.
   */
  byNamePosition: Map<string, SleeperPlayerData>
  /** DEF entries: team abbreviation -> data */
  dstByTeamAbbrev: Map<string, SleeperPlayerData>
}

export async function fetchSleeperRanks(): Promise<SleeperRanks> {
  const data = await fetchJson<Record<string, SleeperPlayer>>(
    'https://api.sleeper.app/v1/players/nfl'
  )

  const byEspnId = new Map<string, SleeperPlayerData>()
  const byNamePosition = new Map<string, SleeperPlayerData>()
  const dstByTeamAbbrev = new Map<string, SleeperPlayerData>()
  for (const p of Object.values(data)) {
    const rank = p.search_rank
    if (typeof rank !== 'number' || rank >= SLEEPER_UNRANKED || !p.active) continue
    const note = p.injury_notes?.trim() || null
    const value: SleeperPlayerData = {
      rank,
      injuryNote:
        note && p.injury_body_part ? `${p.injury_body_part} — ${note}` : note ?? p.injury_body_part ?? null,
      depthChartPosition: p.depth_chart_position ?? null,
      depthChartOrder: p.depth_chart_order ?? null,
      newsUpdated: p.news_updated ? new Date(p.news_updated).toISOString() : null,
    }
    if (p.position === 'DEF') {
      dstByTeamAbbrev.set(p.player_id, value) // Sleeper DEF ids are team abbrevs
      continue
    }
    if (p.espn_id) byEspnId.set(String(p.espn_id), value)
    if (p.full_name && p.position) {
      const key = namePositionKey(p.full_name, p.position)
      const existing = byNamePosition.get(key)
      if (existing === undefined || rank < existing.rank) byNamePosition.set(key, value)
    }
  }
  return { byEspnId, byNamePosition, dstByTeamAbbrev }
}

// ============================================================
// FantasyPros
// ============================================================

interface FpPlayer {
  player_name: string
  player_team_id: string
  player_position_id: string
  rank_ecr: number
  tier?: number
  /** e.g. "WR12" */
  pos_rank?: string
  player_owned_avg?: number
}

export interface FpPlayerData {
  rank: number
  tier: number | null
  posRank: string | null
  /** 0-100 */
  ownedAvg: number | null
}

export interface FantasyProsRanks {
  /** normalized "name|position" -> expert consensus rank + tier data */
  byNamePosition: Map<string, FpPlayerData>
  /** DST entries: team abbreviation -> data */
  dstByTeamAbbrev: Map<string, FpPlayerData>
}

/** Normalize a player name for cross-site matching. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z\s]/g, '') // strip punctuation (D'Andre, A.J., St. Brown)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '') // strip suffixes
    .replace(/\s+/g, ' ')
    .trim()
}

export const namePositionKey = (name: string, position: string) =>
  `${normalizeName(name)}|${position}`

export async function fetchFantasyProsRanks(): Promise<FantasyProsRanks> {
  const res = await fetch('https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`FantasyPros error: ${res.status} ${res.statusText}`)
  const html = await res.text()

  const start = html.indexOf('ecrData = {')
  if (start < 0) throw new Error('FantasyPros: ecrData not found in page')
  const json = extractJsonObject(html, start + 'ecrData = '.length)
  const data = JSON.parse(json) as { players?: FpPlayer[] }

  const byNamePosition = new Map<string, FpPlayerData>()
  const dstByTeamAbbrev = new Map<string, FpPlayerData>()
  for (const p of data.players ?? []) {
    if (typeof p.rank_ecr !== 'number') continue
    const value: FpPlayerData = {
      rank: p.rank_ecr,
      tier: typeof p.tier === 'number' ? p.tier : null,
      posRank: p.pos_rank ?? null,
      ownedAvg: typeof p.player_owned_avg === 'number' ? p.player_owned_avg : null,
    }
    if (p.player_position_id === 'DST') {
      dstByTeamAbbrev.set(p.player_team_id, value)
    } else {
      byNamePosition.set(namePositionKey(p.player_name, p.player_position_id), value)
    }
  }
  return { byNamePosition, dstByTeamAbbrev }
}

/** Extract a balanced JSON object literal starting at `start` (a '{'). */
function extractJsonObject(text: string, start: number): string {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
    } else if (c === '{') {
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error('Unbalanced JSON object')
}
