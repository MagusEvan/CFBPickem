/**
 * Determine current CFB week for the "This Week" pane.
 *
 * Rules:
 * 1. Find the latest week where at least one game has started.
 * 2. If that week's games are all final AND it's Thursday or later,
 *    advance to the next week.
 * 3. If no games have started yet, show the nearest upcoming week.
 */
export function computeCurrentCfbWeek(
  games: { week: number; status: string; startTime: string | null }[],
  availableWeeks: number[]
): number {
  if (availableWeeks.length === 0) return 1
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 4=Thu

  // Walk backwards to find the latest week with at least one started game
  for (let i = availableWeeks.length - 1; i >= 0; i--) {
    const week = availableWeeks[i]
    const weekGames = games.filter((g) => g.week === week)
    if (weekGames.length === 0) continue

    const hasStarted = weekGames.some(
      (g) => g.startTime && new Date(g.startTime) <= now
    )
    if (!hasStarted) continue

    const allFinal = weekGames.every((g) => g.status === 'final')

    // Advance to next week on Thursday+ if all games are done
    if (allFinal && dayOfWeek >= 4) {
      const nextWeek = availableWeeks[i + 1]
      if (nextWeek != null) return nextWeek
    }

    return week
  }

  // No games have started yet — show the nearest upcoming week
  for (const week of availableWeeks) {
    const weekGames = games.filter((g) => g.week === week)
    if (weekGames.some((g) => g.startTime && new Date(g.startTime) > now)) {
      return week
    }
  }

  return availableWeeks[0]
}
