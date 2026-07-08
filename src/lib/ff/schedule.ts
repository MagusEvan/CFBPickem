// Pure round-robin H2H schedule generation (circle method). Odd member
// counts get a rotating bye (matchup with away_member_id null).

export interface GeneratedMatchup {
  week: number
  home_member_id: string
  away_member_id: string | null
}

/**
 * Generate `weeks` weeks of matchups. Each round-robin cycle pairs everyone
 * once; cycles repeat (with home/away flipped each cycle) until all weeks
 * are filled.
 */
export function generateRoundRobin(memberIds: string[], weeks: number): GeneratedMatchup[] {
  if (memberIds.length < 2) return []

  // Circle method: fix slots[0], rotate the rest. null = bye for odd counts.
  const slots: Array<string | null> = [...memberIds]
  if (slots.length % 2 === 1) slots.push(null)
  const n = slots.length
  const roundsPerCycle = n - 1

  const matchups: GeneratedMatchup[] = []
  for (let week = 1; week <= weeks; week++) {
    const round = (week - 1) % roundsPerCycle
    const cycle = Math.floor((week - 1) / roundsPerCycle)

    // Rotation for this round
    const arrangement = [slots[0], ...rotate(slots.slice(1), round)]
    for (let i = 0; i < n / 2; i++) {
      let a = arrangement[i]
      let b = arrangement[n - 1 - i]
      // Alternate home/away by round + cycle parity for fairness
      if ((round + cycle) % 2 === 1) [a, b] = [b, a]
      if (a === null && b === null) continue
      if (a === null) [a, b] = [b, a]
      matchups.push({ week, home_member_id: a!, away_member_id: b })
    }
  }
  return matchups
}

function rotate<T>(arr: T[], by: number): T[] {
  const k = by % arr.length
  return [...arr.slice(arr.length - k), ...arr.slice(0, arr.length - k)]
}
