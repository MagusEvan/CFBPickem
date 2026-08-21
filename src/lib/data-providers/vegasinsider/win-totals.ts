// Season win totals scraped from VegasInsider's public odds page, which
// aggregates sportsbook lines (BetMGM, DraftKings, Caesars, FanDuel, Rivers).
// We prefer the DraftKings number and fall back to the other books.

const WIN_TOTALS_URL = 'https://www.vegasinsider.com/college-football/odds/win-totals/'

// Cell order within each row: [team, BetMGM, DraftKings, Caesars, FanDuel, Rivers]
// Preference order for which book's line to use:
const BOOK_CELL_PREFERENCE = [2, 4, 1, 3, 5]

export interface WinTotalEntry {
  slug: string
  projectedWins: number
}

export async function fetchCfbWinTotals(): Promise<WinTotalEntry[]> {
  const res = await fetch(WIN_TOTALS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`VegasInsider fetch failed: ${res.status}`)
  const html = await res.text()

  const entries: WinTotalEntry[] = []
  const rowRe = /<tr class="" data-name="([^"]+)"([\s\S]*?)<\/tr>/g
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(html)) !== null) {
    const slug = m[1]
    const body = m[2].replace(/<script[\s\S]*?<\/script>/g, '')
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      c[1].replace(/<[^>]+>/g, ' ')
    )
    for (const idx of BOOK_CELL_PREFERENCE) {
      const line = cells[idx]?.match(/[ou]\s*(\d+(?:\.\d+)?)/)
      if (line) {
        entries.push({ slug, projectedWins: Number(line[1]) })
        break
      }
    }
  }

  if (entries.length === 0) {
    throw new Error('VegasInsider win totals page returned no parseable rows — layout may have changed')
  }
  return entries
}

// Known name variants between VegasInsider and CFBD, tried in either
// direction after normalization. Everything else matches on normalized name.
const ALIAS_GROUPS: string[][] = [
  ['miami (fl)', 'miami'],
  ['appalachian state', 'app state'],
  ['louisiana-monroe', 'ul monroe', 'louisiana monroe'],
  ['connecticut', 'uconn'],
  ['massachusetts', 'umass'],
  ['southern mississippi', 'southern miss'],
  ['san jose state', 'san josé state'],
]

const ALIASES = new Map<string, string[]>()
for (const group of ALIAS_GROUPS) {
  for (const name of group) {
    ALIASES.set(name, group)
  }
}

export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`.]/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Match scraped entries to cached team names. Returns a map of team name ->
 * projected wins plus the slugs that failed to match (for admin feedback).
 */
export function matchWinTotals(
  entries: WinTotalEntry[],
  teamNames: string[]
): { byTeamName: Map<string, number>; unmatched: string[] } {
  const nameByNormalized = new Map<string, string>()
  for (const name of teamNames) {
    nameByNormalized.set(normalizeTeamName(name), name)
  }

  const byTeamName = new Map<string, number>()
  const unmatched: string[] = []
  for (const entry of entries) {
    const normalized = normalizeTeamName(entry.slug)
    let target = nameByNormalized.get(normalized)
    if (!target) {
      for (const candidate of ALIASES.get(normalized) ?? []) {
        target = nameByNormalized.get(candidate)
        if (target) break
      }
    }
    if (target) {
      byTeamName.set(target, entry.projectedWins)
    } else {
      unmatched.push(entry.slug)
    }
  }
  return { byTeamName, unmatched }
}
