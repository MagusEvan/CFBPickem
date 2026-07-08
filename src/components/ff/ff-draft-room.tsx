'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useFfDraftRealtime } from '@/hooks/use-ff-draft-realtime'
import {
  startFfDraft,
  makeFfPick,
  enforceFfPickDeadline,
  pauseFfDraft,
  resumeFfDraft,
  undoFfPick,
  resetFfDraft,
} from '@/lib/ff/draft-actions'
import { draftRounds } from '@/lib/ff/draft-engine'
import { PickTimer } from './pick-timer'
import { PlayerPoolTable } from './player-pool-table'
import { DraftBoard } from './draft-board'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import type { Pool, PoolMember, Profile } from '@/lib/types'
import type { FFPlayer, FFLeagueSettings } from '@/lib/ff/types'

export function FfDraftRoom({
  pool,
  members,
  players,
  settings,
  currentUserId,
}: {
  pool: Pool
  members: (PoolMember & { profiles: Profile })[]
  players: FFPlayer[]
  settings: FFLeagueSettings
  currentUserId: string
}) {
  const { draftState, picks, loading, refetch } = useFfDraftRealtime(pool.id)
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)

  const isAdmin = pool.admin_id === currentUserId
  const myMember = members.find((m) => m.user_id === currentUserId)
  const rounds = draftRounds(settings)
  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const onClockMember = draftState?.current_member_id
    ? memberById.get(draftState.current_member_id)
    : null
  const isMyTurn =
    draftState?.status === 'in_progress' && onClockMember?.user_id === currentUserId
  const canPick = isMyTurn || (isAdmin && draftState?.status === 'in_progress')

  const runAction = useCallback(
    async (action: () => Promise<{ error?: string }>) => {
      setActionPending(true)
      const result = await action()
      setActionPending(false)
      if (result.error) toast.error(result.error)
      else refetch()
    },
    [refetch]
  )

  // React Compiler memoizes these (manual useCallback deps can't be preserved)
  const handlePick = async (player: FFPlayer) => {
    if (!draftState?.current_member_id) return
    setPendingPlayerId(player.id)
    const result = await makeFfPick(pool.id, player.id, draftState.current_member_id)
    setPendingPlayerId(null)
    if (result.error) {
      toast.error(result.error)
      refetch()
    }
  }

  const handleExpire = () => {
    // Idempotent server enforcement — safe for every client to call
    enforceFfPickDeadline(pool.id).then(() => refetch())
  }

  if (loading || !draftState) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  // --- Pre-draft ---
  if (draftState.status === 'pre_draft') {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Fantasy Football Draft</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} managers · {rounds} rounds ·{' '}
          {settings.draft.timerSeconds ? `${settings.draft.timerSeconds}s pick clock` : 'untimed'}
        </p>
        {isAdmin ? (
          <Button
            size="lg"
            disabled={actionPending || members.length < 2}
            onClick={() => runAction(() => startFfDraft(pool.id))}
          >
            {actionPending ? 'Starting…' : 'Start Draft'}
          </Button>
        ) : (
          <p className="text-muted-foreground">Waiting for the commissioner to start the draft.</p>
        )}
      </div>
    )
  }

  // --- Completed ---
  if (draftState.status === 'completed') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Draft Results</h1>
            <p className="text-sm text-muted-foreground">{picks.length} picks made</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                disabled={actionPending}
                onClick={() => runAction(() => undoFfPick(pool.id))}
              >
                Undo Last Pick
              </Button>
            )}
            <Link href={`/pools/${pool.id}`} className={buttonVariants({ variant: 'default' })}>
              Go to League
            </Link>
          </div>
        </div>
        <DraftBoard members={members} picks={picks} rounds={rounds} currentPickNumber={null} />
      </div>
    )
  }

  // --- In progress / paused ---
  const paused = draftState.status === 'paused'

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline">
              Rd {draftState.current_round} · Pick {draftState.current_pick_number}
            </Badge>
            {paused ? (
              <Badge variant="secondary">Paused</Badge>
            ) : (
              <span className="text-sm">
                On the clock:{' '}
                <span className={isMyTurn ? 'font-bold text-primary' : 'font-medium'}>
                  {isMyTurn ? 'You' : onClockMember?.profiles.display_name ?? '—'}
                </span>
              </span>
            )}
            {!paused && draftState.timer_seconds && (
              <PickTimer deadline={draftState.pick_deadline} onExpire={handleExpire} />
            )}
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              {paused ? (
                <Button size="sm" disabled={actionPending} onClick={() => runAction(() => resumeFfDraft(pool.id))}>
                  Resume
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={actionPending} onClick={() => runAction(() => pauseFfDraft(pool.id))}>
                  Pause
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={actionPending || picks.length === 0} onClick={() => runAction(() => undoFfPick(pool.id))}>
                Undo
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={actionPending}
                onClick={() => {
                  if (confirm('Reset the draft? All picks will be deleted.')) {
                    runAction(() => resetFfDraft(pool.id))
                  }
                }}
              >
                Reset
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Available Players
            {isAdmin && !isMyTurn && !paused && ' (picking for the manager on the clock)'}
          </h2>
          <PlayerPoolTable
            players={players}
            draftedIds={draftedIds}
            canPick={canPick && !paused}
            pendingPlayerId={pendingPlayerId}
            onPick={handlePick}
          />
          {myMember && (
            <div className="mt-3 text-xs text-muted-foreground">
              Your picks: {picks.filter((p) => p.member_id === myMember.id).length}/{rounds}
            </div>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Draft Board</h2>
          <DraftBoard
            members={members}
            picks={picks}
            rounds={rounds}
            currentPickNumber={draftState.current_pick_number}
          />
        </div>
      </div>
    </div>
  )
}
