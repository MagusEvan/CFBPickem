import type { WcTeam } from '../types'

// 2026 FIFA World Cup — 48 qualified teams
// Groups A-L, 4 teams per group
// Official draw: December 5, 2025 — Washington, D.C.
// Flag URLs from flagcdn.com (public, free CDN)

function flag(code: string): string {
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`
}

export const WORLD_CUP_2026_TEAMS: WcTeam[] = [
  // Group A
  { id: 'MEX', name: 'Mexico', abbreviation: 'MEX', group: 'A', logoUrl: null, flagUrl: flag('mx') },
  { id: 'RSA', name: 'South Africa', abbreviation: 'RSA', group: 'A', logoUrl: null, flagUrl: flag('za') },
  { id: 'KOR', name: 'South Korea', abbreviation: 'KOR', group: 'A', logoUrl: null, flagUrl: flag('kr') },
  { id: 'CZE', name: 'Czechia', abbreviation: 'CZE', group: 'A', logoUrl: null, flagUrl: flag('cz') },

  // Group B
  { id: 'CAN', name: 'Canada', abbreviation: 'CAN', group: 'B', logoUrl: null, flagUrl: flag('ca') },
  { id: 'BIH', name: 'Bosnia and Herzegovina', abbreviation: 'BIH', group: 'B', logoUrl: null, flagUrl: flag('ba') },
  { id: 'QAT', name: 'Qatar', abbreviation: 'QAT', group: 'B', logoUrl: null, flagUrl: flag('qa') },
  { id: 'SUI', name: 'Switzerland', abbreviation: 'SUI', group: 'B', logoUrl: null, flagUrl: flag('ch') },

  // Group C
  { id: 'BRA', name: 'Brazil', abbreviation: 'BRA', group: 'C', logoUrl: null, flagUrl: flag('br') },
  { id: 'MAR', name: 'Morocco', abbreviation: 'MAR', group: 'C', logoUrl: null, flagUrl: flag('ma') },
  { id: 'HAI', name: 'Haiti', abbreviation: 'HAI', group: 'C', logoUrl: null, flagUrl: flag('ht') },
  { id: 'SCO', name: 'Scotland', abbreviation: 'SCO', group: 'C', logoUrl: null, flagUrl: flag('gb-sct') },

  // Group D
  { id: 'USA', name: 'United States', abbreviation: 'USA', group: 'D', logoUrl: null, flagUrl: flag('us') },
  { id: 'PAR', name: 'Paraguay', abbreviation: 'PAR', group: 'D', logoUrl: null, flagUrl: flag('py') },
  { id: 'AUS', name: 'Australia', abbreviation: 'AUS', group: 'D', logoUrl: null, flagUrl: flag('au') },
  { id: 'TUR', name: 'Türkiye', abbreviation: 'TUR', group: 'D', logoUrl: null, flagUrl: flag('tr') },

  // Group E
  { id: 'GER', name: 'Germany', abbreviation: 'GER', group: 'E', logoUrl: null, flagUrl: flag('de') },
  { id: 'CUR', name: 'Curacao', abbreviation: 'CUR', group: 'E', logoUrl: null, flagUrl: flag('cw') },
  { id: 'CIV', name: 'Ivory Coast', abbreviation: 'CIV', group: 'E', logoUrl: null, flagUrl: flag('ci') },
  { id: 'ECU', name: 'Ecuador', abbreviation: 'ECU', group: 'E', logoUrl: null, flagUrl: flag('ec') },

  // Group F
  { id: 'NED', name: 'Netherlands', abbreviation: 'NED', group: 'F', logoUrl: null, flagUrl: flag('nl') },
  { id: 'JPN', name: 'Japan', abbreviation: 'JPN', group: 'F', logoUrl: null, flagUrl: flag('jp') },
  { id: 'SWE', name: 'Sweden', abbreviation: 'SWE', group: 'F', logoUrl: null, flagUrl: flag('se') },
  { id: 'TUN', name: 'Tunisia', abbreviation: 'TUN', group: 'F', logoUrl: null, flagUrl: flag('tn') },

  // Group G
  { id: 'BEL', name: 'Belgium', abbreviation: 'BEL', group: 'G', logoUrl: null, flagUrl: flag('be') },
  { id: 'EGY', name: 'Egypt', abbreviation: 'EGY', group: 'G', logoUrl: null, flagUrl: flag('eg') },
  { id: 'IRN', name: 'Iran', abbreviation: 'IRN', group: 'G', logoUrl: null, flagUrl: flag('ir') },
  { id: 'NZL', name: 'New Zealand', abbreviation: 'NZL', group: 'G', logoUrl: null, flagUrl: flag('nz') },

  // Group H
  { id: 'SPA', name: 'Spain', abbreviation: 'SPA', group: 'H', logoUrl: null, flagUrl: flag('es') },
  { id: 'CPV', name: 'Cape Verde', abbreviation: 'CPV', group: 'H', logoUrl: null, flagUrl: flag('cv') },
  { id: 'KSA', name: 'Saudi Arabia', abbreviation: 'KSA', group: 'H', logoUrl: null, flagUrl: flag('sa') },
  { id: 'URU', name: 'Uruguay', abbreviation: 'URU', group: 'H', logoUrl: null, flagUrl: flag('uy') },

  // Group I
  { id: 'FRA', name: 'France', abbreviation: 'FRA', group: 'I', logoUrl: null, flagUrl: flag('fr') },
  { id: 'SEN', name: 'Senegal', abbreviation: 'SEN', group: 'I', logoUrl: null, flagUrl: flag('sn') },
  { id: 'IRQ', name: 'Iraq', abbreviation: 'IRQ', group: 'I', logoUrl: null, flagUrl: flag('iq') },
  { id: 'NOR', name: 'Norway', abbreviation: 'NOR', group: 'I', logoUrl: null, flagUrl: flag('no') },

  // Group J
  { id: 'ARG', name: 'Argentina', abbreviation: 'ARG', group: 'J', logoUrl: null, flagUrl: flag('ar') },
  { id: 'ALG', name: 'Algeria', abbreviation: 'ALG', group: 'J', logoUrl: null, flagUrl: flag('dz') },
  { id: 'AUT', name: 'Austria', abbreviation: 'AUT', group: 'J', logoUrl: null, flagUrl: flag('at') },
  { id: 'JOR', name: 'Jordan', abbreviation: 'JOR', group: 'J', logoUrl: null, flagUrl: flag('jo') },

  // Group K
  { id: 'POR', name: 'Portugal', abbreviation: 'POR', group: 'K', logoUrl: null, flagUrl: flag('pt') },
  { id: 'COD', name: 'Congo DR', abbreviation: 'COD', group: 'K', logoUrl: null, flagUrl: flag('cd') },
  { id: 'UZB', name: 'Uzbekistan', abbreviation: 'UZB', group: 'K', logoUrl: null, flagUrl: flag('uz') },
  { id: 'COL', name: 'Colombia', abbreviation: 'COL', group: 'K', logoUrl: null, flagUrl: flag('co') },

  // Group L
  { id: 'ENG', name: 'England', abbreviation: 'ENG', group: 'L', logoUrl: null, flagUrl: flag('gb-eng') },
  { id: 'CRO', name: 'Croatia', abbreviation: 'CRO', group: 'L', logoUrl: null, flagUrl: flag('hr') },
  { id: 'GHA', name: 'Ghana', abbreviation: 'GHA', group: 'L', logoUrl: null, flagUrl: flag('gh') },
  { id: 'PAN', name: 'Panama', abbreviation: 'PAN', group: 'L', logoUrl: null, flagUrl: flag('pa') },
]

export function getWorldCupTeams(_year: number): WcTeam[] {
  // Currently only 2026 data; extend when future WC rosters are known
  return WORLD_CUP_2026_TEAMS
}
