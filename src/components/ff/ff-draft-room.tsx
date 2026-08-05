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
  nominateFfPlayer,
  placeFfBid,
  closeFfLot,
  enforceFfNominationDeadline,
} from '@/lib/ff/draft-actions'
import { draftRounds, maxBid } from '@/lib/ff/draft-engine'
import { PickTimer } from './pick-timer'
import { PlayerPoolTable } from './player-pool-table'
import { DraftBoard } from './draft-board'
import { DraftRosterPanel } from './draft-roster-panel'
import { AuctionLot } from './auction-lot'
import { AuctionResults } from './auction-results'
import { BudgetTracker, type BudgetRow } from './budget-tracker'
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
  const { draftState, picks, bids, loading, refetch } = useFfDraftRealtime(pool.id)
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [sideView, setSideView] = useState<'board' | 'team'>('board')

  const isAdmin = pool.admin_id === currentUserId
  const myMember = members.find((m) => m.user_id === currentUserId)
  const rounds = draftRounds(settings)
  const isAuction = settings.draft.type === 'auction'
  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const nameByMember = useMemo(
    () => new Map(members.map((m) => [m.id, m.profiles.display_name])),
    [members]
  )
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const onClockMember = draftState?.current_member_id
    ? memberById.get(draftState.current_member_id)
    : null
  const isMyTurn =
    draftState?.status === 'in_progress' && onClockMember?.user_id === currentUserId
  const canPick = isMyTurn || (isAdmin && draftState?.status === 'in_progress')

  // Auction budget math is derived from pick prices (server does the same)
  const budgetRows = useMemo<BudgetRow[]>(() => {
    if (!isAuction) return []
    return members.map((m) => {
      const mine = picks.filter((p) => p.member_id === m.id)
      const spent = mine.reduce((sum, p) => sum + (p.price ?? 0), 0)
      const openSpots = rounds - mine.length
      return {
        memberId: m.id,
        name: m.profiles.display_name,
        spent,
        budget: settings.draft.auctionBudget,
        openSpots,
        maxBid: maxBid(settings.draft.auctionBudget - spent, openSpots),
        isNominating: draftState?.nominating_member_id === m.id,
        isMe: m.user_id === currentUserId,
      }
    })
  }, [isAuction, members, picks, rounds, settings.draft.auctionBudget, draftState?.nominating_member_id, currentUserId])

  const nominator = draftState?.nominating_member_id
    ? memberById.get(draftState.nominating_member_id)
    : null
  const isMyNomination =
    draftState?.status === 'in_progress' && nominator?.user_id === currentUserId
  const lotOpen = Boolean(draftState?.lot_player_id)

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
    setPendingPlayerId(player.id)
    // Only claim an on-behalf-of pick when it genuinely isn't our turn. Sending
    // our cached current_member_id on our own turn made every pick depend on
    // that cache being current: one missed realtime update and the server saw a
    // pick for the wrong member and rejected it, so the first click only ever
    // repaired the state via the error path and the second click did the pick.
    // Non-admins can only ever pick as themselves, so never send it for them —
    // a stale id would surface "only the commissioner can pick for others" on
    // what is actually their own turn.
    const result = await makeFfPick(
      pool.id,
      player.id,
      isAdmin && !isMyTurn ? draftState?.current_member_id ?? undefined : undefined
    )
    setPendingPlayerId(null)
    if (result.error) toast.error(result.error)
    // Refetch either way — a successful pick advances the clock, and relying on
    // realtime alone to deliver that is what let the client drift in the first place.
    refetch()
  }

  const handleExpire = () => {
    // Idempotent server enforcement — safe for every client to call
    enforceFfPickDeadline(pool.id).then(() => refetch())
  }

  const handleNominate = async (player: FFPlayer) => {
    setPendingPlayerId(player.id)
    const result = await nominateFfPlayer(pool.id, player.id)
    setPendingPlayerId(null)
    if (result.error) toast.error(result.error)
    refetch()
  }

  const handleBid = async (amount: number) => {
    setActionPending(true)
    const result = await placeFfBid(pool.id, amount)
    setActionPending(false)
    if (result.error) {
      toast.error(result.error)
      refetch()
    }
  }

  const handleLotExpire = () => {
    closeFfLot(pool.id).then(() => refetch())
  }

  const handleNominationExpire = () => {
    enforceFfNominationDeadline(pool.id).then(() => refetch())
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
          {members.length} managers ·{' '}
          {isAuction
            ? `auction · $${settings.draft.auctionBudget} budget · ${settings.draft.auctionBidSeconds}s bid clock`
            : `snake · ${rounds} rounds`}{' '}
          ·{' '}
          {settings.draft.timerSeconds
            ? `${settings.draft.timerSeconds}s ${isAuction ? 'nomination' : 'pick'} clock`
            : isAuction ? 'untimed nominations' : 'untimed'}
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
            <Link href={`/pools/${pool.id}?view=details`} className={buttonVariants({ variant: 'default' })}>
              Go to League
            </Link>
          </div>
        </div>
        {draftState.draft_type === 'auction' ? (
          <AuctionResults members={members} picks={picks} budget={settings.draft.auctionBudget} />
        ) : (
          <DraftBoard members={members} picks={picks} rounds={rounds} currentPickNumber={null} />
        )}
      </div>
    )
  }

  // --- In progress / paused ---
  const paused = draftState.status === 'paused'
  const lotPlayer = draftState.lot_player_id ? playerById.get(draftState.lot_player_id) : null
  const myBudget = budgetRows.find((r) => r.isMe)
  const totalPicks = members.length * rounds

  const myPicks = myMember ? picks.filter((p) => p.member_id === myMember.id) : []
  const myTeamPanel = (
    <DraftRosterPanel
      picks={myPicks}
      playersById={playerById}
      settings={settings}
      totalRounds={rounds}
      isBestBall={pool.game_type === 'ff_bestball'}
      emptyLabel="You haven't drafted anyone yet."
    />
  )

  /** Segmented toggle for the right-hand column. */
  const sideToggle = (label: string) => (
    <div className="mb-2 flex items-center gap-1">
      <Button
        size="sm"
        variant={sideView === 'board' ? 'default' : 'outline'}
        onClick={() => setSideView('board')}
      >
        {label}
      </Button>
      {myMember && (
        <Button
          size="sm"
          variant={sideView === 'team' ? 'default' : 'outline'}
          onClick={() => setSideView('team')}
        >
          My Team
        </Button>
      )}
    </div>
  )

  const adminControls = isAdmin && (
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
  )

  if (draftState.draft_type === 'auction') {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <Badge variant="outline">
                Nomination {Math.min(draftState.nomination_number, totalPicks)} / {totalPicks}
              </Badge>
              {paused ? (
                <Badge variant="secondary">Paused</Badge>
              ) : lotOpen ? (
                <span className="text-sm">Bidding is live</span>
              ) : (
                <span className="text-sm">
                  Nominating:{' '}
                  <span className={isMyNomination ? 'font-bold text-primary' : 'font-medium'}>
                    {isMyNomination ? 'You' : nominator?.profiles.display_name ?? '—'}
                  </span>
                </span>
              )}
              {!paused && !lotOpen && draftState.timer_seconds && (
                <PickTimer deadline={draftState.pick_deadline} onExpire={handleNominationExpire} />
              )}
            </div>
            {adminControls}
          </CardContent>
        </Card>

        {!paused && lotOpen && lotPlayer && (
          <AuctionLot
            player={lotPlayer}
            highBid={draftState.lot_high_bid ?? 1}
            highBidderName={
              draftState.lot_high_bidder_id
                ? nameByMember.get(draftState.lot_high_bidder_id) ?? '—'
                : '—'
            }
            iAmHighBidder={draftState.lot_high_bidder_id === myMember?.id}
            deadline={draftState.lot_deadline}
            myMaxBid={myBudget?.maxBid ?? 0}
            bids={bids.filter((b) => b.nomination_number === draftState.nomination_number)}
            nameByMember={nameByMember}
            pending={actionPending}
            onBid={handleBid}
            onExpire={handleLotExpire}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
          <div className="space-y-4">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Budgets</h2>
              <BudgetTracker rows={budgetRows} />
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                Available Players
                {isAdmin && !isMyNomination && !paused && !lotOpen && ' (nominating for the manager on the clock)'}
              </h2>
              <PlayerPoolTable
                players={players}
                draftedIds={draftedIds}
                canPick={(isMyNomination || (isAdmin && !paused)) && !lotOpen && !paused}
                pendingPlayerId={pendingPlayerId}
                onPick={handleNominate}
                actionLabel="Nominate"
                pendingLabel="Nominating…"
              />
            </div>
          </div>
          <div>
            {sideToggle('Rosters')}
            {sideView === 'board' || !myMember ? (
              <AuctionResults members={members} picks={picks} budget={settings.draft.auctionBudget} />
            ) : (
              myTeamPanel
            )}
          </div>
        </div>
      </div>
    )
  }

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
          {adminControls}
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
              Your picks: {myPicks.length}/{rounds}
            </div>
          )}
        </div>
        <div>
          {sideToggle('Draft Board')}
          {sideView === 'board' || !myMember ? (
            <DraftBoard
              members={members}
              picks={picks}
              rounds={rounds}
              currentPickNumber={draftState.current_pick_number}
            />
          ) : (
            myTeamPanel
          )}
        </div>
      </div>
    </div>
  )
}
