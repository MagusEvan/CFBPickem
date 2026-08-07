// One-line game context for a player: "vs KC · Sun 1:00 PM" (scheduled,
// tz-aware via GameTime), "@ KC · 0:42 - 4th · 21-17" (live), "vs KC · W 27-17".

import { GameTime } from '@/components/schedule/game-time'
import type { PlayerGameInfo } from '@/lib/ff/stat-format'

export function PlayerGameContext({ info }: { info: PlayerGameInfo | null }) {
  if (!info) return null
  return (
    <span className="whitespace-nowrap">
      {info.matchup}
      {' · '}
      {info.detail ?? <GameTime startTime={info.startTime} />}
    </span>
  )
}
