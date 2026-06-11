import type { WcGame, WcStage } from '../types'
import { parseEspnBroadcasts } from '@/lib/broadcasts'

const ESPN_WC_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatVenue(venue: any): string | null {
  if (!venue) return null
  const name = venue.fullName || venue.name
  if (!name) return null
  const city = venue.address?.city
  const state = venue.address?.state
  const country = venue.address?.country
  const parts = [name]
  if (city) {
    const loc = state ? `${city}, ${state}` : country ? `${city}, ${country}` : city
    parts.push(loc)
  }
  return parts.join(' — ')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStage(slug: string, _round: any): WcStage {
  const s = slug.toLowerCase()
  if (s.includes('group')) return 'group'
  if (s.includes('round of 32') || s.includes('round-of-32')) return 'round_of_32'
  if (s.includes('round of 16') || s.includes('round-of-16')) return 'round_of_16'
  if (s.includes('quarterfinal') || s.includes('quarter')) return 'quarter'
  if (s.includes('semifinal') || s.includes('semi')) return 'semi'
  if (s.includes('third') || s.includes('3rd')) return 'third_place'
  if (s.includes('final') && !s.includes('semi') && !s.includes('quarter')) return 'final'
  return 'group'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGame(event: any): WcGame | null {
  const competition = event.competitions?.[0]
  if (!competition) return null

  const competitors = competition.competitors || []
  const home = competitors.find((c: { homeAway: string }) => c.homeAway === 'home')
  const away = competitors.find((c: { homeAway: string }) => c.homeAway === 'away')
  if (!home || !away) return null

  const status = event.status?.type?.name
  let gameStatus: 'scheduled' | 'in_progress' | 'final' = 'scheduled'
  if (status === 'STATUS_FINAL') gameStatus = 'final'
  else if (status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME') gameStatus = 'in_progress'

  // Detect OT and shootout from status detail
  const detail = (event.status?.type?.detail || '').toLowerCase()
  const isOvertime = detail.includes('extra time') || detail.includes('aet') || detail.includes('overtime')
  const isShootout = detail.includes('penalties') || detail.includes('shootout')

  // Penalty scores are in the competition's format or in competitor stats
  let homePenaltyScore: number | null = null
  let awayPenaltyScore: number | null = null
  if (isShootout) {
    // ESPN sometimes puts penalty scores in shootoutScore or in linescores
    homePenaltyScore = home.shootoutScore ?? home.penalties ?? null
    awayPenaltyScore = away.shootoutScore ?? away.penalties ?? null
  }

  const stageName = event.season?.slug || event.group?.name || ''

  return {
    id: event.id,
    stage: mapStage(stageName, event),
    homeTeam: {
      id: home.team?.abbreviation || home.team?.id,
      name: home.team?.displayName || home.team?.name || '',
      score: home.score != null ? Number(home.score) : null,
    },
    awayTeam: {
      id: away.team?.abbreviation || away.team?.id,
      name: away.team?.displayName || away.team?.name || '',
      score: away.score != null ? Number(away.score) : null,
    },
    status: gameStatus,
    statusDetail: event.status?.type?.detail ?? null,
    startTime: event.date || null,
    venue: formatVenue(competition.venue) || null,
    isOvertime,
    isShootout,
    homePenaltyScore,
    awayPenaltyScore,
    broadcasts: parseEspnBroadcasts(competition.geoBroadcasts),
  }
}

export async function fetchWorldCupGames(year: number): Promise<WcGame[]> {
  const url = `${ESPN_WC_BASE}/scoreboard?dates=${year}&limit=200`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 900 }, // 15 minutes
  })

  if (!res.ok) {
    throw new Error(`ESPN World Cup API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const events = data.events || []

  return events
    .map(parseGame)
    .filter((g: WcGame | null): g is WcGame => g !== null)
}
