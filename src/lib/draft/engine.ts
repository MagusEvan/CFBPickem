import type { SnakePick, DraftConfig, PickValidation } from './types'
import type { CachedTeam } from '@/lib/types'

/**
 * Generate the full snake draft order.
 * Odd rounds go 1→N, even rounds go N→1.
 */
export function generateSnakeOrder(config: DraftConfig): SnakePick[] {
  const { managerCount, numRounds } = config
  const picks: SnakePick[] = []
  let pickNumber = 1

  for (let round = 1; round <= numRounds; round++) {
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
 * Find which pick corresponds to a given overall pick number.
 */
export function getPickInfo(snakeOrder: SnakePick[], pickNumber: number): SnakePick | null {
  return snakeOrder.find((p) => p.pickNumber === pickNumber) ?? null
}

/**
 * Validate a draft pick.
 * Managers freely choose a conference + team each pick.
 * They cannot pick from a conference they've already drafted from,
 * unless PAC12_IND is depleted and they haven't used their bonus pick yet.
 */
export function validatePick(params: {
  teamId: string
  teamConferenceKey: string
  chosenConferenceKey: string
  currentPickMemberId: string
  requestingMemberId: string
  draftedTeamIds: Set<string>
  memberConferences: Set<string> // conference keys this manager already drafted from
  memberHasBonusPick: boolean // whether this manager already used a bonus pick
  pac12IndDepleted: boolean
  poolConferences: string[]
}): PickValidation {
  const {
    teamId,
    teamConferenceKey,
    chosenConferenceKey,
    currentPickMemberId,
    requestingMemberId,
    draftedTeamIds,
    memberConferences,
    memberHasBonusPick,
    pac12IndDepleted,
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

  // 3. Team must belong to the chosen conference
  if (teamConferenceKey !== chosenConferenceKey) {
    return { valid: false, error: 'This team is not in the selected conference.' }
  }

  // 4. Conference must be a pool conference
  if (!poolConferences.includes(chosenConferenceKey)) {
    return { valid: false, error: 'This conference is not part of this pool.' }
  }

  // 5. Manager can't pick from a conference they've already drafted from
  if (memberConferences.has(chosenConferenceKey)) {
    // Exception: if PAC12_IND is depleted and they haven't picked from PAC12_IND
    // and haven't used their bonus pick, they can pick a second team from another conference
    if (pac12IndDepleted && !memberConferences.has('PAC12_IND') && !memberHasBonusPick) {
      // This is a bonus pick — allowed
    } else {
      return { valid: false, error: 'You already have a team from this conference.' }
    }
  }

  return { valid: true }
}

/**
 * Determine which conferences a manager can still pick from.
 */
export function getAvailableConferences(
  poolConferences: string[],
  memberConferences: Set<string>,
  pac12IndDepleted: boolean,
  memberHasBonusPick: boolean
): string[] {
  const available = poolConferences.filter((conf) => {
    // Already drafted from this conference
    if (memberConferences.has(conf)) return false
    // PAC12_IND is depleted — can't pick from it
    if (conf === 'PAC12_IND' && pac12IndDepleted) return false
    return true
  })

  // If PAC12_IND is depleted and manager doesn't have a PAC12_IND team
  // and hasn't used a bonus pick, they can also pick from conferences they already have
  if (pac12IndDepleted && !memberConferences.has('PAC12_IND') && !memberHasBonusPick) {
    const bonusConferences = poolConferences.filter(
      (conf) => conf !== 'PAC12_IND' && memberConferences.has(conf)
    )
    return [...available, ...bonusConferences]
  }

  return available
}

/**
 * Check if the Pac-12/Independent pool is depleted.
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
