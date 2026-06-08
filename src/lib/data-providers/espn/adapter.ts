import type { CfbTeam, CfbGame, CfbTeamRecord } from '../types'

// ESPN API response shapes (simplified)

interface EspnTeamEntry {
  team: {
    id: string
    displayName: string
    abbreviation: string
    color?: string
    alternateColor?: string
    logos?: { href: string }[]
  }
}

interface EspnEvent {
  id: string
  date: string
  week: { number: number }
  season: { year: number }
  competitions: {
    venue?: { fullName: string; address?: { city?: string; state?: string; country?: string } }
    competitors: {
      id: string
      team: { displayName: string }
      homeAway: 'home' | 'away'
      score?: string
    }[]
    status: { type: { completed: boolean; description: string } }
  }[]
}

function formatCfbVenue(venue?: { fullName: string; address?: { city?: string; state?: string; country?: string } }): string | null {
  if (!venue) return null
  const name = venue.fullName
  const city = venue.address?.city
  const state = venue.address?.state
  if (city && state) return `${name} — ${city}, ${state}`
  if (city) return `${name} — ${city}`
  return name
}

export function adaptEspnTeam(entry: EspnTeamEntry, conferenceKey: string): CfbTeam {
  const t = entry.team
  return {
    id: t.id,
    name: t.displayName,
    abbreviation: t.abbreviation,
    conferenceKey,
    logoUrl: t.logos?.[0]?.href ?? null,
    colorPrimary: t.color ? `#${t.color}` : null,
    colorSecondary: t.alternateColor ? `#${t.alternateColor}` : null,
  }
}

export function adaptEspnGame(event: EspnEvent): CfbGame {
  const comp = event.competitions[0]
  const home = comp.competitors.find((c) => c.homeAway === 'home')!
  const away = comp.competitors.find((c) => c.homeAway === 'away')!
  const isCompleted = comp.status.type.completed

  return {
    id: event.id,
    week: event.week.number,
    seasonYear: event.season.year,
    homeTeam: {
      id: home.id,
      name: home.team.displayName,
      score: home.score ? Number(home.score) : null,
    },
    awayTeam: {
      id: away.id,
      name: away.team.displayName,
      score: away.score ? Number(away.score) : null,
    },
    status: isCompleted ? 'final' : 'scheduled',
    startTime: event.date,
    venue: formatCfbVenue(comp.venue) ?? null,
  }
}

export function adaptEspnRecord(entry: EspnTeamEntry & { recordItems?: { summary: string }[] }): CfbTeamRecord {
  const record = entry.recordItems?.[0]?.summary ?? '0-0'
  const [wins, losses] = record.split('-').map(Number)
  return {
    teamId: entry.team.id,
    teamName: entry.team.displayName,
    wins: wins || 0,
    losses: losses || 0,
  }
}
