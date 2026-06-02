import type { WcTeam } from '../types'

// 2026 FIFA World Cup — 48 qualified teams
// Groups A-L, 4 teams per group
// Flag URLs from flagcdn.com (public, free CDN)

function flag(code: string): string {
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`
}

export const WORLD_CUP_2026_TEAMS: WcTeam[] = [
  // Group A
  { id: 'USA', name: 'United States', abbreviation: 'USA', group: 'A', logoUrl: null, flagUrl: flag('us') },
  { id: 'MAR', name: 'Morocco', abbreviation: 'MAR', group: 'A', logoUrl: null, flagUrl: flag('ma') },
  { id: 'SCO', name: 'Scotland', abbreviation: 'SCO', group: 'A', logoUrl: null, flagUrl: flag('gb-sct') },
  { id: 'ARG', name: 'Argentina', abbreviation: 'ARG', group: 'A', logoUrl: null, flagUrl: flag('ar') },

  // Group B
  { id: 'POR', name: 'Portugal', abbreviation: 'POR', group: 'B', logoUrl: null, flagUrl: flag('pt') },
  { id: 'PAR', name: 'Paraguay', abbreviation: 'PAR', group: 'B', logoUrl: null, flagUrl: flag('py') },
  { id: 'NZL', name: 'New Zealand', abbreviation: 'NZL', group: 'B', logoUrl: null, flagUrl: flag('nz') },
  { id: 'SPA', name: 'Spain', abbreviation: 'SPA', group: 'B', logoUrl: null, flagUrl: flag('es') },

  // Group C
  { id: 'MEX', name: 'Mexico', abbreviation: 'MEX', group: 'C', logoUrl: null, flagUrl: flag('mx') },
  { id: 'EGY', name: 'Egypt', abbreviation: 'EGY', group: 'C', logoUrl: null, flagUrl: flag('eg') },
  { id: 'BIH', name: 'Bosnia and Herzegovina', abbreviation: 'BIH', group: 'C', logoUrl: null, flagUrl: flag('ba') },
  { id: 'UZB', name: 'Uzbekistan', abbreviation: 'UZB', group: 'C', logoUrl: null, flagUrl: flag('uz') },

  // Group D
  { id: 'FRA', name: 'France', abbreviation: 'FRA', group: 'D', logoUrl: null, flagUrl: flag('fr') },
  { id: 'COL', name: 'Colombia', abbreviation: 'COL', group: 'D', logoUrl: null, flagUrl: flag('co') },
  { id: 'KSA', name: 'Saudi Arabia', abbreviation: 'KSA', group: 'D', logoUrl: null, flagUrl: flag('sa') },
  { id: 'AUS', name: 'Australia', abbreviation: 'AUS', group: 'D', logoUrl: null, flagUrl: flag('au') },

  // Group E
  { id: 'CAN', name: 'Canada', abbreviation: 'CAN', group: 'E', logoUrl: null, flagUrl: flag('ca') },
  { id: 'AUT', name: 'Austria', abbreviation: 'AUT', group: 'E', logoUrl: null, flagUrl: flag('at') },
  { id: 'CIV', name: 'Ivory Coast', abbreviation: 'CIV', group: 'E', logoUrl: null, flagUrl: flag('ci') },
  { id: 'SRB', name: 'Serbia', abbreviation: 'SRB', group: 'E', logoUrl: null, flagUrl: flag('rs') },

  // Group F
  { id: 'BRA', name: 'Brazil', abbreviation: 'BRA', group: 'F', logoUrl: null, flagUrl: flag('br') },
  { id: 'ITA', name: 'Italy', abbreviation: 'ITA', group: 'F', logoUrl: null, flagUrl: flag('it') },
  { id: 'NGA', name: 'Nigeria', abbreviation: 'NGA', group: 'F', logoUrl: null, flagUrl: flag('ng') },
  { id: 'ECU', name: 'Ecuador', abbreviation: 'ECU', group: 'F', logoUrl: null, flagUrl: flag('ec') },

  // Group G
  { id: 'GER', name: 'Germany', abbreviation: 'GER', group: 'G', logoUrl: null, flagUrl: flag('de') },
  { id: 'URU', name: 'Uruguay', abbreviation: 'URU', group: 'G', logoUrl: null, flagUrl: flag('uy') },
  { id: 'TUN', name: 'Tunisia', abbreviation: 'TUN', group: 'G', logoUrl: null, flagUrl: flag('tn') },
  { id: 'DEN', name: 'Denmark', abbreviation: 'DEN', group: 'G', logoUrl: null, flagUrl: flag('dk') },

  // Group H
  { id: 'JPN', name: 'Japan', abbreviation: 'JPN', group: 'H', logoUrl: null, flagUrl: flag('jp') },
  { id: 'CRC', name: 'Costa Rica', abbreviation: 'CRC', group: 'H', logoUrl: null, flagUrl: flag('cr') },
  { id: 'BEL', name: 'Belgium', abbreviation: 'BEL', group: 'H', logoUrl: null, flagUrl: flag('be') },
  { id: 'CHN', name: 'China', abbreviation: 'CHN', group: 'H', logoUrl: null, flagUrl: flag('cn') },

  // Group I
  { id: 'ENG', name: 'England', abbreviation: 'ENG', group: 'I', logoUrl: null, flagUrl: flag('gb-eng') },
  { id: 'SEN', name: 'Senegal', abbreviation: 'SEN', group: 'I', logoUrl: null, flagUrl: flag('sn') },
  { id: 'POL', name: 'Poland', abbreviation: 'POL', group: 'I', logoUrl: null, flagUrl: flag('pl') },
  { id: 'PAN', name: 'Panama', abbreviation: 'PAN', group: 'I', logoUrl: null, flagUrl: flag('pa') },

  // Group J
  { id: 'NED', name: 'Netherlands', abbreviation: 'NED', group: 'J', logoUrl: null, flagUrl: flag('nl') },
  { id: 'IRN', name: 'Iran', abbreviation: 'IRN', group: 'J', logoUrl: null, flagUrl: flag('ir') },
  { id: 'GHA', name: 'Ghana', abbreviation: 'GHA', group: 'J', logoUrl: null, flagUrl: flag('gh') },
  { id: 'KOR', name: 'South Korea', abbreviation: 'KOR', group: 'J', logoUrl: null, flagUrl: flag('kr') },

  // Group K
  { id: 'SUI', name: 'Switzerland', abbreviation: 'SUI', group: 'K', logoUrl: null, flagUrl: flag('ch') },
  { id: 'CMR', name: 'Cameroon', abbreviation: 'CMR', group: 'K', logoUrl: null, flagUrl: flag('cm') },
  { id: 'CRO', name: 'Croatia', abbreviation: 'CRO', group: 'K', logoUrl: null, flagUrl: flag('hr') },
  { id: 'HON', name: 'Honduras', abbreviation: 'HON', group: 'K', logoUrl: null, flagUrl: flag('hn') },

  // Group L
  { id: 'ALB', name: 'Albania', abbreviation: 'ALB', group: 'L', logoUrl: null, flagUrl: flag('al') },
  { id: 'CHL', name: 'Chile', abbreviation: 'CHL', group: 'L', logoUrl: null, flagUrl: flag('cl') },
  { id: 'JAM', name: 'Jamaica', abbreviation: 'JAM', group: 'L', logoUrl: null, flagUrl: flag('jm') },
  { id: 'TUR', name: 'Turkey', abbreviation: 'TUR', group: 'L', logoUrl: null, flagUrl: flag('tr') },
]

export function getWorldCupTeams(_year: number): WcTeam[] {
  // Currently only 2026 data; extend when future WC rosters are known
  return WORLD_CUP_2026_TEAMS
}
