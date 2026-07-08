// Pure mapping from ESPN NFL game-summary payloads to canonical FFStatLine
// records. ESPN boxscore stats are parallel keys[]/stats[] string arrays with
// some combined values ("21/34", "2/2"). FG distances and 2-pt conversions
// only exist in scoringPlays text, so those are parsed separately.
//
// Verified against summary payloads (2025 season). Isolated here so payload
// drift only requires fixing this file (raw JSONB is stored, not points).

import type { FFStatLine } from '@/lib/ff/types'

// --- Minimal ESPN payload shapes (only fields we read) ---

export interface EspnBoxscoreAthlete {
  athlete: { id: string; displayName: string }
  stats: string[]
}

export interface EspnBoxscoreCategory {
  name: string
  keys: string[]
  athletes: EspnBoxscoreAthlete[]
}

export interface EspnBoxscoreTeamPlayers {
  team: { id: string; abbreviation: string }
  statistics: EspnBoxscoreCategory[]
}

export interface EspnScoringPlay {
  type?: { abbreviation?: string }
  text?: string
  team?: { abbreviation?: string }
}

export interface EspnSummaryCompetitor {
  team: { id: string; abbreviation: string }
  homeAway: 'home' | 'away'
  score: string
}

// --- Helpers ---

function num(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** "21/34" -> [21, 34] */
function splitPair(v: string | undefined): [number, number] {
  const [a, b] = (v ?? '').split('/')
  return [num(a), num(b)]
}

function stat(category: EspnBoxscoreCategory, athlete: EspnBoxscoreAthlete, key: string): string | undefined {
  const i = category.keys.indexOf(key)
  return i >= 0 ? athlete.stats[i] : undefined
}

function add(lines: Record<string, FFStatLine>, playerId: string, patch: FFStatLine) {
  const line = (lines[playerId] ??= {})
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number' && v !== 0) {
      const key = k as keyof FFStatLine
      line[key] = (line[key] ?? 0) + v
    }
  }
}

// --- Category mappers (player-attributed stats) ---

function mapCategory(
  cat: EspnBoxscoreCategory,
  lines: Record<string, FFStatLine>,
  athletes: Record<string, { name: string; position: string | null }>
) {
  const positionGuess: Record<string, string | null> = {
    passing: 'QB',
    rushing: 'RB',
    receiving: 'WR',
    kicking: 'K',
  }

  for (const a of cat.athletes) {
    const id = a.athlete.id
    athletes[id] ??= { name: a.athlete.displayName, position: positionGuess[cat.name] ?? null }

    switch (cat.name) {
      case 'passing': {
        add(lines, id, {
          pass_yd: num(stat(cat, a, 'passingYards')),
          pass_td: num(stat(cat, a, 'passingTouchdowns')),
          pass_int: num(stat(cat, a, 'interceptions')),
        })
        break
      }
      case 'rushing': {
        add(lines, id, {
          rush_yd: num(stat(cat, a, 'rushingYards')),
          rush_td: num(stat(cat, a, 'rushingTouchdowns')),
        })
        break
      }
      case 'receiving': {
        add(lines, id, {
          rec: num(stat(cat, a, 'receptions')),
          rec_yd: num(stat(cat, a, 'receivingYards')),
          rec_td: num(stat(cat, a, 'receivingTouchdowns')),
        })
        break
      }
      case 'fumbles': {
        add(lines, id, { fum_lost: num(stat(cat, a, 'fumblesLost')) })
        break
      }
      case 'kicking': {
        const [fgMade, fgAtt] = splitPair(stat(cat, a, 'fieldGoalsMade/fieldGoalAttempts'))
        const [xpMade, xpAtt] = splitPair(stat(cat, a, 'extraPointsMade/extraPointAttempts'))
        // FG distance buckets come from scoringPlays; misses have no distance
        add(lines, id, {
          fg_miss: Math.max(0, fgAtt - fgMade),
          xp: xpMade,
          xp_miss: Math.max(0, xpAtt - xpMade),
        })
        break
      }
    }
  }
}

// --- Scoring plays: FG distances + 2-pt conversions ---

const FG_RE = /^(.+?)\s+(\d+)\s+Yd\s+Field\s+Goal/i
const TWO_PT_RE = /\(([^)]*Two[- ]Point[^)]*)\)/i
const PASS_2PT_RE = /^(.+?)\s+Pass\s+to\s+(.+?)\s+for\s+Two[- ]Point/i
const RUN_2PT_RE = /^(.+?)\s+Run\s+for\s+Two[- ]Point/i

function mapScoringPlays(
  plays: EspnScoringPlay[],
  lines: Record<string, FFStatLine>,
  nameToId: Map<string, string>
) {
  for (const play of plays) {
    const text = play.text ?? ''

    // Made field goals with distance
    if (play.type?.abbreviation === 'FG') {
      const m = FG_RE.exec(text)
      if (m) {
        const id = nameToId.get(normalizeName(m[1]))
        if (id) {
          const dist = Number(m[2])
          add(lines, id, dist >= 50 ? { fg_50_plus: 1 } : dist >= 40 ? { fg_40_49: 1 } : { fg_0_39: 1 })
        }
      }
      continue
    }

    // Two-point conversions (appear in the TD parenthetical)
    const twoPt = TWO_PT_RE.exec(text)
    if (twoPt) {
      const conv = twoPt[1]
      const passM = PASS_2PT_RE.exec(conv)
      const runM = RUN_2PT_RE.exec(conv)
      if (passM) {
        const passerId = nameToId.get(normalizeName(passM[1]))
        const receiverId = nameToId.get(normalizeName(passM[2]))
        if (passerId) add(lines, passerId, { pass_2pt: 1 })
        if (receiverId) add(lines, receiverId, { rec_2pt: 1 })
      } else if (runM) {
        const rusherId = nameToId.get(normalizeName(runM[1]))
        if (rusherId) add(lines, rusherId, { rush_2pt: 1 })
      }
    }
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

// --- DST derivation ---

function sumCategory(cat: EspnBoxscoreCategory | undefined, key: string): number {
  if (!cat) return 0
  const i = cat.keys.indexOf(key)
  if (i < 0) return 0
  return cat.athletes.reduce((sum, a) => sum + num(a.stats[i]), 0)
}

function findCat(team: EspnBoxscoreTeamPlayers, name: string) {
  return team.statistics.find((c) => c.name === name)
}

function mapDst(
  team: EspnBoxscoreTeamPlayers,
  opponent: EspnBoxscoreTeamPlayers,
  pointsAllowed: number,
  scoringPlays: EspnScoringPlay[],
  lines: Record<string, FFStatLine>
) {
  const dstId = `DST-${team.team.abbreviation}`
  const defensive = findCat(team, 'defensive')
  const interceptions = findCat(team, 'interceptions')
  const oppFumbles = findCat(opponent, 'fumbles')

  const safeties = scoringPlays.filter(
    (p) => p.team?.abbreviation === team.team.abbreviation && p.type?.abbreviation === 'SF'
  ).length

  add(lines, dstId, {
    dst_sack: sumCategory(defensive, 'sacks'),
    dst_int: sumCategory(interceptions, 'interceptions'),
    dst_fum_rec: sumCategory(oppFumbles, 'fumblesLost'),
    dst_td:
      sumCategory(defensive, 'defensiveTouchdowns') +
      sumCategory(interceptions, 'interceptionTouchdowns'),
    dst_safety: safeties,
  })
  // Points allowed is meaningful at 0 (shutout tier), so set it directly —
  // add() drops zeros. This also guarantees the DST row exists.
  const line = (lines[dstId] ??= {})
  line.dst_points_allowed = pointsAllowed
}

// --- Entry point ---

export function mapGameSummary(input: {
  boxscorePlayers: EspnBoxscoreTeamPlayers[]
  scoringPlays: EspnScoringPlay[]
  competitors: EspnSummaryCompetitor[]
}): {
  statLines: Record<string, FFStatLine>
  athletes: Record<string, { name: string; position: string | null }>
} {
  const lines: Record<string, FFStatLine> = {}
  const athletes: Record<string, { name: string; position: string | null }> = {}

  // Name -> id index for scoringPlays attribution
  const nameToId = new Map<string, string>()
  for (const team of input.boxscorePlayers) {
    for (const cat of team.statistics) {
      for (const a of cat.athletes) {
        nameToId.set(normalizeName(a.athlete.displayName), a.athlete.id)
      }
    }
  }

  for (const team of input.boxscorePlayers) {
    for (const cat of team.statistics) {
      mapCategory(cat, lines, athletes)
    }
  }

  mapScoringPlays(input.scoringPlays, lines, nameToId)

  // Drop all-zero lines (players listed in a category with no counting stats)
  // so they don't bloat ff_player_stats. DST rows are added after this.
  for (const [id, line] of Object.entries(lines)) {
    if (Object.keys(line).length === 0) delete lines[id]
  }

  // DST rows (one per team, keyed DST-{abbrev})
  if (input.boxscorePlayers.length === 2) {
    const [t1, t2] = input.boxscorePlayers
    const scoreByTeamId = new Map(input.competitors.map((c) => [c.team.id, num(c.score)]))
    mapDst(t1, t2, scoreByTeamId.get(t2.team.id) ?? 0, input.scoringPlays, lines)
    mapDst(t2, t1, scoreByTeamId.get(t1.team.id) ?? 0, input.scoringPlays, lines)
    athletes[`DST-${t1.team.abbreviation}`] = { name: `${t1.team.abbreviation} D/ST`, position: 'DST' }
    athletes[`DST-${t2.team.abbreviation}`] = { name: `${t2.team.abbreviation} D/ST`, position: 'DST' }
  }

  return { statLines: lines, athletes }
}
