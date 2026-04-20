import type { SnakePick, DraftConfig, PickValidation } from './types'
import type { DraftPick, CachedTeam } from '@/lib/types'

/**
 * Generate the full snake draft order.
 * Odd rounds go 1→N, even rounds go N→1.
 */
export function generateSnakeOrder(config: DraftConfig): SnakePick[] {
  const { managerCount, conferences } = config
  const rounds = conferences.length
  const picks: SnakePick[] = []
  let pickNumber = 1

  for (let round = 1; round <= rounds; round++) {
    const isReversed = round % 2 === 0
    for (let i = 0; i < managerCount; i++) {
      const managerPosition = isReversed ? managerCount - i : i + 1
      picks.push({ round, pickNumber, managerPosition })
      pickNumber++
    }
  }

  return picks
}

/**
 * Get the conference being drafted in a given round.
 */
export function getConferenceForRound(conferences: string[], round: number): string {
  return conferences[round - 1]
}

/**
 * Find which pick corresponds to a given overall pick number.
 */
export function getPickInfo(snakeOrder: SnakePick[], pickNumber: number): SnakePick | null {
  return snakeOrder.find((p) => p.pickNumber === pickNumber) ?? null
}

/**
 * Validate a draft pick.
 */
export function validatePick(params: {
  teamId: string
  teamConferenceKey: string
  roundConferenceKey: string
  currentPickMemberId: string
  requestingMemberId: string
  draftedTeamIds: Set<string>
  memberConferences: Set<string> // conference keys this manager already drafted from
  isPac12IndDepleted: boolean
  isDepletingConference: boolean // true if this round's conference is PAC12_IND
  poolConferences: string[]
}): PickValidation {
  const {
    teamId,
    teamConferenceKey,
    roundConferenceKey,
    currentPickMemberId,
    requestingMemberId,
    draftedTeamIds,
    memberConferences,
    isPac12IndDepleted,
    isDepletingConference,
    poolConferences,
  } = params

  // 1. Verify it's the requesting manager's turn
  if (currentPickMemberId !== requestingMemberId) {
    return { valid: false, error: 'It is not your turn to pick.' }
  }

  // 2. Team not already drafted
  if (draftedTeamIds.has(teamId)) {
    return { valid: false, error: 'This team has already been drafted.' }
  }

  // 3. Conference validation
  if (isDepletingConference && isPac12IndDepleted) {
    // Bonus pick: can pick from any other pool conference (not PAC12_IND)
    const validConferences = poolConferences.filter((c) => c !== 'PAC12_IND')
    if (!validConferences.includes(teamConferenceKey)) {
      return { valid: false, error: 'Bonus pick must be from a pool conference (not Pac-12/Independent).' }
    }
  } else {
    // Normal pick: team must be from the round's conference
    if (teamConferenceKey !== roundConferenceKey) {
      return { valid: false, error: `This team is not in the ${roundConferenceKey} conference.` }
    }
  }

  // 4. Manager doesn't already have a team from this team's conference
  //    (exception: bonus picks allow a second team from a conference)
  if (!(isDepletingConference && isPac12IndDepleted)) {
    if (memberConferences.has(teamConferenceKey)) {
      return { valid: false, error: 'You already have a team from this conference.' }
    }
  }

  return { valid: true }
}

/**
 * Check if the Pac-12/Independent pool is depleted for a given round.
 * Returns true if all available teams have been drafted.
 */
export function checkPac12Depletion(
  pac12IndTeamCount: number,
  pac12IndPicksMade: number
): boolean {
  return pac12IndPicksMade >= pac12IndTeamCount
}

/**
 * Calculate Team Scraps: best undrafted team from each conference (by wins).
 * Called once at draft completion.
 */
export function calculateTeamScraps(
  allTeams: CachedTeam[],
  draftedTeamIds: Set<string>,
  conferenceKeys: string[]
): { conferenceKey: string; team: CachedTeam }[] {
  return conferenceKeys
    .map((conf) => {
      const undrafted = allTeams
        .filter((t) => t.conference_key === conf && !draftedTeamIds.has(t.id))
        .sort((a, b) => b.wins - a.wins)
      return undrafted[0] ? { conferenceKey: conf, team: undrafted[0] } : null
    })
    .filter((s): s is { conferenceKey: string; team: CachedTeam } => s !== null)
}
