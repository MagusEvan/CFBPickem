'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getFfPlayerDetail, type FFPlayerDetail } from '@/lib/ff/player-actions'
import { PlayerGameContext } from './player-game-context'
import type { FFPlayer } from '@/lib/ff/types'

/**
 * Player dialog: season totals, this week's game, and the weekly game log —
 * fetched on open via a server action so the catalog payload stays lean.
 */
export function PlayerDetailSheet({
  poolId,
  player,
  onClose,
}: {
  poolId: string
  /** null = closed */
  player: FFPlayer | null
  onClose: () => void
}) {
  // Keyed by player id so a stale fetch for a previously opened player is
  // ignored rather than needing a synchronous reset in the effect
  const [loaded, setLoaded] = useState<{
    playerId: string
    detail?: FFPlayerDetail
    error?: string
  } | null>(null)
  const [, startTransition] = useTransition()

  const playerId = player?.id ?? null
  useEffect(() => {
    if (!playerId) return
    startTransition(async () => {
      const result = await getFfPlayerDetail(poolId, playerId)
      setLoaded(
        'error' in result
          ? { playerId, error: result.error }
          : { playerId, detail: result }
      )
    })
  }, [poolId, playerId])

  const detail = loaded?.playerId === playerId ? loaded.detail ?? null : null
  const error = loaded?.playerId === playerId ? loaded.error ?? null : null

  return (
    <Dialog open={player !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {player && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {player.headshot_url ? (
                  <Image
                    src={player.headshot_url}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full bg-muted object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="h-10 w-10 rounded-full bg-muted" />
                )}
                <span>
                  {player.name}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {player.position} · {player.nfl_team_abbrev ?? 'FA'}
                    {player.jersey && ` · #${player.jersey}`}
                  </span>
                </span>
                {player.injury_status && (
                  <Badge variant="destructive" className="text-[10px] uppercase">
                    {player.injury_status}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            {(player.injury_note || player.depth_chart_position) && (
              <p className="text-sm text-muted-foreground">
                {player.depth_chart_position && (
                  <>
                    Depth: {player.depth_chart_position}
                    {player.depth_chart_order !== null && ` #${player.depth_chart_order}`}
                    {player.injury_note && ' · '}
                  </>
                )}
                {player.injury_note}
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {!detail && !error && (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}

            {detail && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted-foreground">Season:</span>{' '}
                    <span className="font-semibold tabular-nums">{detail.totalPts.toFixed(2)}</span> pts
                  </span>
                  <span>
                    <span className="text-muted-foreground">Avg:</span>{' '}
                    <span className="font-semibold tabular-nums">{detail.avgPts.toFixed(2)}</span>
                  </span>
                  {detail.byeWeek !== null && (
                    <span>
                      <span className="text-muted-foreground">Bye:</span>{' '}
                      <span className="font-semibold">{detail.byeWeek}</span>
                    </span>
                  )}
                  {detail.currentGame && (
                    <span className="text-muted-foreground">
                      <PlayerGameContext info={detail.currentGame} />
                    </span>
                  )}
                </div>

                {detail.log.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No stats recorded this season.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">Wk</th>
                        <th className="px-2 py-1.5 font-medium">Stats</th>
                        <th className="px-2 py-1.5 text-right font-medium">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...detail.log].reverse().map((entry) => (
                        <tr key={entry.week} className="border-b last:border-0">
                          <td className="px-2 py-1.5 font-medium">{entry.week}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">
                            {entry.statLine || '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {entry.points.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
