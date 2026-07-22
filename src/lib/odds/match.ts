import type { OddsApiSport } from './the-odds-api'

/**
 * Normalize a participant name for matching across data sources:
 * lowercase, strip accents/punctuation, handle "Last, First" ordering.
 */
export function normalizeName(name: string): string {
  let n = name.trim()
  // "Scheffler, Scottie" → "Scottie Scheffler"
  const comma = n.indexOf(',')
  if (comma !== -1) n = `${n.slice(comma + 1).trim()} ${n.slice(0, comma).trim()}`
  return n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const GOLF_STOPWORDS = new Set([
  'the', 'golf', 'tournament', 'championship', 'winner', 'pga', 'tour',
  'presented', 'by', 'of', 'at', 'a', 'an', 'in',
])

function titleTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !GOLF_STOPWORDS.has(t))
  )
}

/**
 * Find The Odds API golf sport key matching a tournament name (e.g.
 * "The Masters" → golf_masters_tournament_winner). Returns null when no
 * confident match — callers fall back to manual odds entry.
 */
export function findGolfSportKey(sports: OddsApiSport[], tournamentName: string): string | null {
  const candidates = sports.filter(
    (s) => s.group === 'Golf' && s.active && s.has_outrights
  )
  const wanted = titleTokens(tournamentName)
  if (wanted.size === 0) return null

  let best: { key: string; score: number } | null = null
  let secondScore = 0
  for (const sport of candidates) {
    const tokens = titleTokens(`${sport.title} ${sport.description ?? ''}`)
    let overlap = 0
    for (const t of wanted) if (tokens.has(t)) overlap++
    const score = overlap / wanted.size
    if (!best || score > best.score) {
      secondScore = best?.score ?? 0
      best = { key: sport.key, score }
    } else if (score > secondScore) {
      secondScore = score
    }
  }

  // Require a majority-token match and a clear winner over the runner-up
  if (!best || best.score < 0.5 || best.score === secondScore) return null
  return best.key
}
