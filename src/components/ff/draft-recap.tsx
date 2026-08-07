'use client'

// Post-draft recap, server-rendered data with no realtime subscription —
// replaces mounting the live draft room for every /draft visit after the
// draft completes.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { undoFfPick } from '@/lib/ff/draft-actions'
import { DraftBoard } from './draft-board'
import { AuctionResults } from './auction-results'
import { DraftRosterPanel } from './draft-roster-panel'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Pool, PoolMember, Profile } from '@/lib/types'
import type { FFDraftPick, FFLeagueSettings, FFPlayer } from '@/lib/ff/types'

export function DraftRecap({
  pool,
  members,
  picks,
  players,
  settings,
  rounds,
  isAdmin,
  isAuction,
  byeWeeks,
}: {
  pool: Pool
  members: (PoolMember & { profiles: Profile })[]
  picks: FFDraftPick[]
  /** The drafted players only (headshots, ADP for value annotations) */
  players: FFPlayer[]
  settings: FFLeagueSettings
  rounds: number
  isAdmin: boolean
  isAuction: boolean
  /** team_id -> regular-season bye week */
  byeWeeks: Record<string, number>
}) {
  const router = useRouter()
  const [undoPending, setUndoPending] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '')

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  // Snake value picks: drafted meaningfully later than ADP
  const valuePicks = useMemo(() => {
    if (isAuction) return []
    return picks
      .map((pick) => {
        const adp = playerById.get(pick.player_id)?.adp
        return adp != null ? { pick, value: pick.pick_number - adp } : null
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && v.value >= 5)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [picks, playerById, isAuction])

  const nameByMember = new Map(members.map((m) => [m.id, m.profiles.display_name]))
  const selectedMember = members.find((m) => m.id === selectedMemberId)
  const selectedPicks = picks.filter((p) => p.member_id === selectedMemberId)

  const handleUndo = async () => {
    setUndoPending(true)
    const result = await undoFfPick(pool.id)
    setUndoPending(false)
    if (result.error) toast.error(result.error)
    else router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Draft Recap</h1>
          <p className="text-sm text-muted-foreground">
            {picks.length} picks · {isAuction ? 'auction' : `snake · ${rounds} rounds`}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" disabled={undoPending} onClick={handleUndo}>
              {undoPending ? 'Undoing…' : 'Undo Last Pick'}
            </Button>
          )}
          <Link href={`/pools/${pool.id}`} className={buttonVariants({ variant: 'default' })}>
            Go to League
          </Link>
        </div>
      </div>

      {valuePicks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Best Value Picks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {valuePicks.map(({ pick, value }) => (
                <li key={pick.id} className="flex items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{pick.player_name}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      {pick.player_position} · {nameByMember.get(pick.member_id) ?? '—'}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    Pick {pick.pick_number} · ADP {playerById.get(pick.player_id)?.adp?.toFixed(0)}{' '}
                    <span className="text-green-600 dark:text-green-500">+{value.toFixed(0)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {isAuction ? (
        <AuctionResults members={members} picks={picks} budget={settings.draft.auctionBudget} />
      ) : (
        <DraftBoard members={members} picks={picks} rounds={rounds} currentPickNumber={null} />
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <h2 className="mr-2 text-sm font-semibold text-muted-foreground">Rosters</h2>
          {members.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={m.id === selectedMemberId ? 'default' : 'outline'}
              onClick={() => setSelectedMemberId(m.id)}
            >
              {m.profiles.display_name}
            </Button>
          ))}
        </div>
        {selectedMember && (
          <div className="max-w-xl">
            <DraftRosterPanel
              picks={selectedPicks}
              playersById={playerById}
              byeWeeks={byeWeeks}
              settings={settings}
              totalRounds={rounds}
              isBestBall={pool.game_type === 'ff_bestball'}
              emptyLabel="No picks."
            />
          </div>
        )}
      </div>
    </div>
  )
}
