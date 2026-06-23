// PGA data provider types — provider-agnostic

export interface PgaGolferData {
  id: string
  name: string
  country: string | null
  imageUrl: string | null
  amateur: boolean
  status: 'active' | 'cut' | 'withdrawn' | 'disqualified'
  position: string | null
  totalScore: number | null    // relative to par (e.g. -5)
  totalStrokes: number | null  // raw stroke total
  roundScores: (number | null)[]   // relative to par, up to 4
  roundStrokes: (number | null)[]  // raw strokes, up to 4
  teeTime: string | null
  thru: string | null
}

export interface PgaEventInfo {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  venue: string | null
  status: string
}
