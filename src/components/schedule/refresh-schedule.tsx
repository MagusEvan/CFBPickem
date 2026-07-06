import { GameTime } from './game-time'

export function ScheduleHeader({ lastFetchedAt }: { lastFetchedAt: string | null }) {
  if (!lastFetchedAt) return null
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs text-muted-foreground">
        Last updated: <GameTime startTime={lastFetchedAt} />
      </span>
    </div>
  )
}
