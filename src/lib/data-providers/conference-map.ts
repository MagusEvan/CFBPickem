// Maps our internal conference keys to API-specific identifiers

export const CONFERENCE_MAP: Record<string, { cfbd: string | null; espnGroupId: string | null }> = {
  ACC:       { cfbd: 'ACC',              espnGroupId: '1' },
  B12:       { cfbd: 'Big 12',           espnGroupId: '4' },
  B1G:       { cfbd: 'Big Ten',          espnGroupId: '5' },
  SEC:       { cfbd: 'SEC',              espnGroupId: '8' },
  AAC:       { cfbd: 'American Athletic', espnGroupId: '151' },
  CUSA:      { cfbd: 'Conference USA',   espnGroupId: '12' },
  MAC:       { cfbd: 'Mid-American',     espnGroupId: '15' },
  MW:        { cfbd: 'Mountain West',    espnGroupId: '17' },
  SBC:       { cfbd: 'Sun Belt',         espnGroupId: '37' },
  PAC12_IND: { cfbd: null,               espnGroupId: null }, // Special: fetched as Pac-12 + Independents
}

// Pac-12 and Independent CFBD conference names
export const PAC12_CFBD = 'Pac-12'
export const INDEPENDENT_CFBD = 'FBS Independents'

// ESPN group IDs for Pac-12 and Independents
export const PAC12_ESPN_GROUP = '21'
export const INDEPENDENT_ESPN_GROUP = '18'
