/**
 * Determine current CFB week. Starting Thursday, advance to next week
 * if all games in the most recent active week are final.
 */
export function computeCurrentCfbWeek(
  games: { week: number; status: string; startTime: string | null }[],
  availableWeeks: number[]
): number {
  if (availableWeeks.length === 0) return 1
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 4=Thu

  for (let i = availableWeeks.length - 1; i >= 0; i--) {
    const week = availableWeeks[i]
    const weekGames = games.filter((g) => g.week === week)
    if (weekGames.length === 0) continue

    const hasStarted = weekGames.some(
      (g) => g.startTime && new Date(g.startTime) <= now
    )
    if (!hasStarted) continue

    const allFinal = weekGames.every((g) => g.status === 'final')

    if (allFinal && dayOfWeek >= 4) {
      const nextWeek = availableWeeks[i + 1]
      if (nextWeek != null) return nextWeek
    }

    return week
  }

  return availableWeeks[0]
}
