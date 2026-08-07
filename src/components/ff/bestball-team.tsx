// Best ball team view: the drafted roster with the selected week's optimal
// lineup (read-only — there are no lineup decisions in best ball).
// Server-safe presentational component; week/member navigate via links.

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerGameContext } from './player-game-context'
import type { PlayerGameInfo } from '@/lib/ff/stat-format'
import type { BestBallLineup } from '@/lib/ff/bestball'
import type { FFPlayer } from '@/lib/ff/types'

export function BestBallTeam({
  poolId,
  week,
  currentWeek,
  memberName,
  memberId,
  isMyTeam,
  lineup,
  playersById,
  statLineByPlayer = {},
  gameInfoByPlayer = {},
}: {
  poolId: string
  week: number
  currentWeek: number
  memberName: string
  memberId: string
  isMyTeam: boolean
  lineup: BestBallLineup
  playersById: Record<string, FFPlayer>
  /** Compact box-score line per player id (empty = game not started) */
  statLineByPlayer?: Record<string, string>
  /** Opponent/status line per player id */
  gameInfoByPlayer?: Record<string, PlayerGameInfo>
}) {
  const subLine = (playerId: string) =>
    statLineByPlayer[playerId] ? (
      <p className="text-[11px] leading-tight text-muted-foreground">
        {statLineByPlayer[playerId]}
      </p>
    ) : gameInfoByPlayer[playerId] ? (
      <p className="text-[11px] leading-tight text-muted-foreground">
        <PlayerGameContext info={gameInfoByPlayer[playerId]} />
      </p>
    ) : null
  const weekHref = (w: number) =>
    `/pools/${poolId}/team?week=${w}${isMyTeam ? '' : `&member=${memberId}`}`

  const unused = Object.values(playersById)
    .filter((p) => !lineup.starterIds.has(p.id))
    .sort(
      (a, b) =>
        (lineup.pointsByPlayer.get(b.id) ?? 0) - (lineup.pointsByPlayer.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name)
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isMyTeam ? 'My Team' : `${memberName}'s Team`}</h1>
          <p className="text-sm text-muted-foreground">
            Week {week} optimal lineup · {lineup.total.toFixed(2)} pts
          </p>
        </div>
        {!isMyTeam && (
          <Link href={`/pools/${poolId}/team`} className={buttonVariants({ variant: 'outline' })}>
            My Team
          </Link>
        )}
      </div>

      {/* Week selector */}
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: currentWeek }, (_, i) => i + 1).map((w) => (
          <Link
            key={w}
            href={weekHref(w)}
            className={`rounded-md border px-2 py-1 text-xs ${
              w === week
                ? 'border-primary bg-primary/10 font-semibold'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {w}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Optimal Lineup</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {lineup.slots.map((slot, i) => {
                  const player = slot.player_id ? playersById[slot.player_id] : null
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="w-14 px-2 py-2 text-xs font-semibold text-muted-foreground">
                        {slot.slot === 'DST' ? 'D/ST' : slot.slot}
                      </td>
                      <td className="px-2 py-2">
                        {player ? (
                          <>
                            {player.name}
                            {player.nfl_team_abbrev && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {player.nfl_team_abbrev}
                              </span>
                            )}
                            {subLine(player.id)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Empty</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {slot.points.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
                <tr>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">
                    Total
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">
                    {lineup.total.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not Counted This Week</CardTitle>
          </CardHeader>
          <CardContent>
            {unused.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Every rostered player made the lineup.
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {unused.map((p) => (
                    <tr key={p.id} className="border-b text-muted-foreground last:border-0">
                      <td className="w-14 px-2 py-2 text-xs font-semibold">
                        {p.position === 'DST' ? 'D/ST' : p.position}
                      </td>
                      <td className="px-2 py-2">
                        {p.name}
                        {p.nfl_team_abbrev && (
                          <span className="ml-1 text-xs">{p.nfl_team_abbrev}</span>
                        )}
                        {subLine(p.id)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {(lineup.pointsByPlayer.get(p.id) ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
