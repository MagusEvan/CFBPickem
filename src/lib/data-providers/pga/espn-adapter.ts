import type { PgaGolferData, PgaEventInfo } from './types'

const ESPN_PGA_BASE = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga'

// Major tournament names for filtering
const MAJOR_KEYWORDS = [
  'masters',
  'pga championship',
  'u.s. open',
  'the open',
  'british open',
]

function isMajor(name: string): boolean {
  const lower = name.toLowerCase()
  return MAJOR_KEYWORDS.some((kw) => lower.includes(kw))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGolferStatus(competitor: any): PgaGolferData['status'] {
  const statusName = competitor.status?.type?.name || ''
  if (statusName === 'STATUS_CUT') return 'cut'
  if (statusName === 'STATUS_WITHDRAWN' || statusName === 'STATUS_WD') return 'withdrawn'
  if (statusName === 'STATUS_DISQUALIFIED' || statusName === 'STATUS_DQ') return 'disqualified'
  return 'active'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGolfer(competitor: any): PgaGolferData {
  const athlete = competitor.athlete || {}
  const linescores = competitor.linescores || []

  // Parse round data from linescores
  const roundStrokes: (number | null)[] = []
  const roundScores: (number | null)[] = []
  for (let i = 0; i < 4; i++) {
    const ls = linescores[i]
    if (ls) {
      roundStrokes.push(ls.value != null ? Number(ls.value) : null)
      // displayValue is relative to par (e.g. "-3", "E", "+2")
      const dv = ls.displayValue
      if (dv === 'E' || dv === 'e') {
        roundScores.push(0)
      } else if (dv != null) {
        roundScores.push(Number(dv))
      } else {
        roundScores.push(null)
      }
    } else {
      roundStrokes.push(null)
      roundScores.push(null)
    }
  }

  // Total score relative to par
  let totalScore: number | null = null
  const scoreStr = competitor.score
  if (scoreStr === 'E' || scoreStr === 'e') {
    totalScore = 0
  } else if (scoreStr != null && scoreStr !== '') {
    totalScore = Number(scoreStr)
  }

  // Total strokes — sum of round strokes
  const playedStrokes = roundStrokes.filter((s): s is number => s !== null)
  const totalStrokes = playedStrokes.length > 0
    ? playedStrokes.reduce((a, b) => a + b, 0)
    : null

  // Country flag from athlete
  const flag = athlete.flag
  const country = flag?.alt || flag?.displayName || null

  return {
    id: String(athlete.id || competitor.id),
    name: athlete.displayName || athlete.shortName || '',
    country,
    imageUrl: athlete.headshot?.href || null,
    amateur: athlete.amateur === true,
    status: parseGolferStatus(competitor),
    position: competitor.status?.position?.displayName || null,
    totalScore,
    totalStrokes,
    roundScores,
    roundStrokes,
    teeTime: competitor.status?.teeTime || null,
    thru: competitor.status?.thru?.displayValue || competitor.status?.displayValue || null,
  }
}

/**
 * Extract course par from an ESPN event object.
 * Tries courses[0].par first, then infers from golfer data (even-par round).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCoursePar(event: any): number | null {
  // Try direct course par field
  const courses = event.competitions?.[0]?.courses
  if (Array.isArray(courses) && courses.length > 0 && courses[0].par != null) {
    return Number(courses[0].par)
  }

  // Infer from golfer data: if someone shot even par (roundScore "E"), their strokes = par
  const competitors = event.competitions?.[0]?.competitors || []
  for (const c of competitors) {
    const linescores = c.linescores || []
    for (const ls of linescores) {
      if ((ls.displayValue === 'E' || ls.displayValue === 'e') && ls.value != null) {
        return Number(ls.value)
      }
    }
  }

  return null
}

/**
 * Fetch course par for a specific event.
 */
export async function fetchEventCoursePar(eventId: string): Promise<number | null> {
  const url = `${ESPN_PGA_BASE}/scoreboard?event=${eventId}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 },
  })

  if (!res.ok) return null

  const data = await res.json()
  const events = data.events || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = events.find((e: any) => String(e.id) === eventId) || events[0]
  if (!event) return null

  return extractCoursePar(event)
}

/**
 * Fetch the list of major events for a given season year.
 */
export async function fetchPgaMajors(year: number): Promise<PgaEventInfo[]> {
  const url = `${ESPN_PGA_BASE}/scoreboard?dates=${year}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 }, // 1 hour
  })

  if (!res.ok) {
    throw new Error(`ESPN PGA API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const events = data.events || []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return events.filter((e: any) => isMajor(e.name || e.shortName || '')).map((e: any) => ({
    id: String(e.id),
    name: e.name || e.shortName || '',
    startDate: e.date || null,
    endDate: e.endDate || null,
    venue: e.competitions?.[0]?.venue?.fullName || null,
    coursePar: extractCoursePar(e),
    status: e.status?.type?.name || 'scheduled',
  }))
}

/**
 * Fetch the golfer field (competitors) for a specific event.
 */
export async function fetchPgaEventGolfers(eventId: string): Promise<PgaGolferData[]> {
  const url = `${ESPN_PGA_BASE}/scoreboard?event=${eventId}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 300 }, // 5 minutes
  })

  if (!res.ok) {
    throw new Error(`ESPN PGA event API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const events = data.events || []

  // Find the matching event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = events.find((e: any) => String(e.id) === eventId) || events[0]
  if (!event) return []

  const competitors = event.competitions?.[0]?.competitors || []
  return competitors.map(parseGolfer)
}
