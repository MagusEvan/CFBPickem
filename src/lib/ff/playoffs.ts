// Pure playoff bracket math: round counts, reseeded pairings, and winner
// resolution. Seeds are 1-based (1 = best regular-season finish).

export interface PlayoffPairing {
  homeSeed: number
  /** null = bye (home seed auto-advances) */
  awaySeed: number | null
}

/** Rounds needed for a bracket: 2 teams -> 1, 3-4 -> 2, 5-8 -> 3. */
export function playoffRoundsCount(playoffTeams: number): number {
  if (playoffTeams < 2) return 0
  return Math.ceil(Math.log2(playoffTeams))
}

/**
 * Pair the surviving seeds for a round, best vs worst (reseeding). When the
 * field isn't a power of two, the top seeds get byes to fill the bracket
 * (e.g. 6 teams: 1 & 2 bye, 3v6, 4v5). Works for round one and every
 * subsequent round — just pass whoever is still alive.
 */
export function roundPairings(aliveSeeds: number[]): PlayoffPairing[] {
  const sorted = [...aliveSeeds].sort((a, b) => a - b)
  if (sorted.length < 2) return []

  const bracketSize = 2 ** Math.ceil(Math.log2(sorted.length))
  const byes = bracketSize - sorted.length

  const pairings: PlayoffPairing[] = sorted
    .slice(0, byes)
    .map((seed) => ({ homeSeed: seed, awaySeed: null }))

  const playing = sorted.slice(byes)
  for (let i = 0; i < playing.length / 2; i++) {
    pairings.push({ homeSeed: playing[i], awaySeed: playing[playing.length - 1 - i] })
  }
  return pairings
}

/** Winning seed of a pairing. Byes auto-advance; ties go to the better seed. */
export function pairingWinner(
  pairing: PlayoffPairing,
  homeScore: number,
  awayScore: number
): number {
  if (pairing.awaySeed === null) return pairing.homeSeed
  if (homeScore > awayScore) return pairing.homeSeed
  if (awayScore > homeScore) return pairing.awaySeed
  return Math.min(pairing.homeSeed, pairing.awaySeed)
}

/** Display name for a playoff round ("Championship", "Semifinals", ...). */
export function playoffRoundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Championship'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round ${round}`
}
