/**
 * The Odds API (the-odds-api.com) client. Requires ODDS_API_KEY; every
 * function degrades gracefully to empty results when the key is missing so
 * manual odds entry remains the fallback everywhere.
 *
 * Free tier is ~500 requests/month — callers must only fetch on explicit
 * admin action (never on page loads) and go through the cached_odds table.
 */

const BASE = 'https://api.the-odds-api.com/v4'

export interface OddsApiSport {
  key: string
  group: string
  title: string
  description: string
  active: boolean
  has_outrights: boolean
}

export interface OutrightOdds {
  participant: string
  /** American odds */
  price: number
  bookmaker: string
  eventKey: string
}

function apiKey(): string | null {
  return process.env.ODDS_API_KEY || null
}

export function hasOddsApiKey(): boolean {
  return apiKey() !== null
}

/** List all sports (including outright/futures markets). */
export async function listSports(): Promise<OddsApiSport[]> {
  const key = apiKey()
  if (!key) return []
  const res = await fetch(`${BASE}/sports/?apiKey=${key}&all=true`)
  if (!res.ok) throw new Error(`The Odds API sports list failed: ${res.status}`)
  return res.json()
}

/** Fetch outright-winner odds for a sport key, flattened across bookmakers. */
export async function getOutrights(sportKey: string): Promise<OutrightOdds[]> {
  const key = apiKey()
  if (!key) return []
  const res = await fetch(
    `${BASE}/sports/${sportKey}/odds/?apiKey=${key}&regions=us&markets=outrights&oddsFormat=american`
  )
  if (!res.ok) throw new Error(`The Odds API outrights failed for ${sportKey}: ${res.status}`)
  const events: Array<{
    id: string
    bookmakers: Array<{
      key: string
      markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }>
    }>
  }> = await res.json()

  const rows: OutrightOdds[] = []
  for (const event of events) {
    for (const bookmaker of event.bookmakers ?? []) {
      const market = (bookmaker.markets ?? []).find((m) => m.key === 'outrights')
      if (!market) continue
      for (const outcome of market.outcomes ?? []) {
        rows.push({
          participant: outcome.name,
          price: outcome.price,
          bookmaker: bookmaker.key,
          eventKey: event.id,
        })
      }
    }
  }
  return rows
}
