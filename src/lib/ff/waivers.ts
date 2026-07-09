// Pure waiver logic: processing schedule, claim ordering, and claim
// resolution. No I/O — waiver-actions.ts applies the returned mutations.

import type { FFLeagueSettings } from './types'

/**
 * Next scheduled processing time strictly after `from`:
 * the next occurrence of processDay (0 = Sunday) at processHourUTC.
 */
export function nextProcessTime(
  waivers: Pick<FFLeagueSettings['waivers'], 'processDay' | 'processHourUTC'>,
  from: Date = new Date()
): Date {
  const next = new Date(from)
  next.setUTCHours(waivers.processHourUTC, 0, 0, 0)
  const dayDiff = (waivers.processDay - next.getUTCDay() + 7) % 7
  next.setUTCDate(next.getUTCDate() + dayDiff)
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 7)
  return next
}

export interface WaiverClaimInput {
  id: string
  memberId: string
  addPlayerId: string
  dropPlayerId: string | null
  bid: number
  claimOrder: number
}

export interface WaiverMemberInput {
  memberId: string
  /** 1 = first claim */
  priority: number
  faabRemaining: number
  /** Player ids currently on this member's roster */
  rosterPlayerIds: string[]
  /** Max roster size (starters + bench; IR excluded) */
  rosterLimit: number
}

export interface WaiverClaimResult {
  id: string
  status: 'won' | 'lost' | 'invalid'
  resolution: string | null
}

export interface WaiverProcessOutcome {
  results: WaiverClaimResult[]
  /** Roster mutations to apply, in order */
  adds: Array<{ memberId: string; playerId: string; bid: number }>
  drops: Array<{ memberId: string; playerId: string }>
  /** memberId -> new priority (full reassignment) */
  newPriority: Map<string, number>
  /** memberId -> FAAB spent this run */
  faabSpent: Map<string, number>
}

/**
 * Resolution order: FAAB leagues award by bid desc, breaking ties by
 * priority; priority leagues award strictly by priority. A member's own
 * claims resolve in their chosen claim_order.
 */
export function orderClaims(
  claims: WaiverClaimInput[],
  priorityByMember: Map<string, number>,
  type: 'faab' | 'priority'
): WaiverClaimInput[] {
  const prio = (c: WaiverClaimInput) => priorityByMember.get(c.memberId) ?? Number.MAX_SAFE_INTEGER
  return [...claims].sort((a, b) => {
    if (type === 'faab' && b.bid !== a.bid) return b.bid - a.bid
    return prio(a) - prio(b) || a.claimOrder - b.claimOrder
  })
}

/**
 * Resolve all pending claims against a snapshot of rosters/budgets.
 * Sequential: each winning claim updates the working state (player becomes
 * owned, roster/FAAB adjusted, winner rotates to last priority).
 */
export function processClaims(
  claims: WaiverClaimInput[],
  members: WaiverMemberInput[],
  type: 'faab' | 'priority'
): WaiverProcessOutcome {
  const state = new Map(
    members.map((m) => [
      m.memberId,
      { ...m, roster: new Set(m.rosterPlayerIds), faab: m.faabRemaining },
    ])
  )
  const owned = new Set(members.flatMap((m) => m.rosterPlayerIds))
  const priorityByMember = new Map(members.map((m) => [m.memberId, m.priority]))
  // Priority order as a queue (by current priority); winners move to the back
  const priorityQueue = [...members]
    .sort((a, b) => a.priority - b.priority)
    .map((m) => m.memberId)

  const outcome: WaiverProcessOutcome = {
    results: [],
    adds: [],
    drops: [],
    newPriority: new Map(),
    faabSpent: new Map(),
  }

  for (const claim of orderClaims(claims, priorityByMember, type)) {
    const m = state.get(claim.memberId)
    const fail = (status: 'lost' | 'invalid', resolution: string) =>
      outcome.results.push({ id: claim.id, status, resolution })

    if (!m) {
      fail('invalid', 'Member no longer in the pool')
      continue
    }
    if (owned.has(claim.addPlayerId)) {
      fail('lost', 'Player was claimed by another manager')
      continue
    }
    if (m.roster.has(claim.addPlayerId)) {
      fail('invalid', 'Player is already on your roster')
      continue
    }
    if (claim.dropPlayerId && !m.roster.has(claim.dropPlayerId)) {
      fail('invalid', 'The player you offered to drop is no longer on your roster')
      continue
    }
    const sizeAfter = m.roster.size + 1 - (claim.dropPlayerId ? 1 : 0)
    if (sizeAfter > m.rosterLimit) {
      fail('invalid', 'No roster spot available (add a drop to your claim)')
      continue
    }
    if (type === 'faab' && claim.bid > m.faab) {
      fail('invalid', `Bid exceeds remaining FAAB ($${m.faab})`)
      continue
    }

    // Won
    outcome.results.push({ id: claim.id, status: 'won', resolution: null })
    owned.add(claim.addPlayerId)
    m.roster.add(claim.addPlayerId)
    outcome.adds.push({ memberId: m.memberId, playerId: claim.addPlayerId, bid: claim.bid })
    if (claim.dropPlayerId) {
      m.roster.delete(claim.dropPlayerId)
      owned.delete(claim.dropPlayerId)
      outcome.drops.push({ memberId: m.memberId, playerId: claim.dropPlayerId })
    }
    if (type === 'faab') {
      m.faab -= claim.bid
      outcome.faabSpent.set(m.memberId, (outcome.faabSpent.get(m.memberId) ?? 0) + claim.bid)
    }
    // Rotate winner to the back of the priority queue
    const idx = priorityQueue.indexOf(m.memberId)
    if (idx >= 0) {
      priorityQueue.splice(idx, 1)
      priorityQueue.push(m.memberId)
    }
  }

  priorityQueue.forEach((memberId, i) => outcome.newPriority.set(memberId, i + 1))
  return outcome
}
