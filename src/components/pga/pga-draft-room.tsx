'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { usePgaDraftRealtime } from '@/hooks/use-pga-draft-realtime'
import { startPgaDraft, makePgaPick, resetPgaDraft, undoPgaPick } from '@/lib/pga/actions'
import { generateSnakeOrder } from '@/lib/draft/engine'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import type { PgaTournament, PgaTournamentMember, PgaGolfer } from '@/lib/types'

interface PgaDraftRoomProps {
  tournament: PgaTournament
  poolId: string
  members: PgaTournamentMember[]
  golfers: PgaGolfer[]
  currentUserId: string
  isAdmin: boolean
}

export function PgaDraftRoom({
  tournament,
  poolId,
  members,
  golfers,
  currentUserId,
  isAdmin,
}: PgaDraftRoomProps) {
  const { draftState, picks, tournamentStatus, loading, refetch } = usePgaDraftRealtime(tournament.id)
  const [pendingPick, setPendingPick] = useState<PgaGolfer | null>(null)
  const [adminPickMode, setAdminPickMode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()

  const draftStatus = tournamentStatus ?? tournament.draft_status

  const currentMember = members.find((m) => m.pool_member?.user_id === currentUserId)
  const isMyTurn = draftState?.current_member_id === currentMember?.id
  const currentPicker = members.find((m) => m.id === draftState?.current_member_id)
  const canPick = isMyTurn || (isAdmin && adminPickMode && !!currentPicker)

  const draftedGolferIds = useMemo(() => new Set(picks.map((p) => p.golfer_id)), [picks])

  // Reset selection when turn changes
  useEffect(() => {
    setPendingPick(null)
    setAdminPickMode(false)
  }, [draftState?.current_pick_number])

  const availableGolfers = useMemo(() => {
    return golfers
      .filter((g) => !draftedGolferIds.has(g.id) && g.status === 'active')
      .filter((g) => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return g.name.toLowerCase().includes(q) || (g.country?.toLowerCase().includes(q) ?? false)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [golfers, draftedGolferIds, searchQuery])

  async function handleStartDraft() {
    setSubmitting(true)
    setError(null)
    try {
      await startPgaDraft(tournament.id, poolId)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft')
    }
    setSubmitting(false)
  }

  async function handleResetDraft() {
    if (!confirm('Are you sure you want to reset the draft? All picks will be deleted.')) return
    setSubmitting(true)
    setError(null)
    try {
      await resetPgaDraft(tournament.id, poolId)
      await refetch()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset draft')
    }
    setSubmitting(false)
  }

  async function handleUndoPick() {
    setSubmitting(true)
    setError(null)
    try {
      await undoPgaPick(tournament.id, poolId)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo pick')
    }
    setSubmitting(false)
  }

  function handleSelectGolfer(golfer: PgaGolfer) {
    if (!canPick || submitting) return
    setPendingPick(golfer)
  }

  async function handleConfirmPick() {
    if (!pendingPick || !canPick || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await makePgaPick(
        tournament.id,
        poolId,
        pendingPick.id,
        pendingPick.name,
        !isMyTurn ? currentPicker?.id : undefined
      )
      setPendingPick(null)
      setSearchQuery('')
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make pick')
    }
    setSubmitting(false)
  }

  // Pre-draft state
  if (draftStatus === 'pre_draft' || (!draftState && tournament.draft_status === 'pre_draft')) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Draft - {tournament.name}</h1>
        <Link href={`/pools/${poolId}/tournaments/${tournament.id}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Tournament
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-2 text-lg text-muted-foreground">
              {members.length} participants · {tournament.golfers_per_manager} golfers each · {golfers.length} golfers in field
            </p>
            {golfers.length === 0 && (
              <p className="mb-4 text-sm text-red-600">
                No golfers loaded yet. Refresh the field from the tournament page before starting.
              </p>
            )}
            {isAdmin && golfers.length > 0 && (
              <Button onClick={handleStartDraft} disabled={submitting || members.length < 2}>
                {submitting && <Spinner className="mr-2" />}
                {submitting ? 'Starting...' : 'Start Draft'}
              </Button>
            )}
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Draft completed
  if (draftStatus === 'completed') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Draft Complete - {tournament.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/pools/${poolId}/tournaments/${tournament.id}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
            &lt; Return to Tournament
          </Link>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={handleUndoPick} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                Undo Last Pick
              </Button>
              <Button variant="destructive" size="sm" onClick={handleResetDraft} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                Reset Draft
              </Button>
            </>
          )}
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <PgaDraftBoard picks={picks} members={members} numRounds={tournament.golfers_per_manager} />
      </div>
    )
  }

  // Active draft
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner className="h-6 w-6" />
        <p className="text-muted-foreground">Loading draft...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Draft - {tournament.name}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/pools/${poolId}/tournaments/${tournament.id}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Tournament
        </Link>
        <p className="text-sm text-muted-foreground">
          Round {draftState?.current_round} &middot; Pick {draftState?.current_pick_number}
        </p>
        {isAdmin && (
          <>
            <Button variant="outline" size="sm" onClick={handleUndoPick} disabled={submitting || picks.length === 0}>
              {submitting && <Spinner className="mr-2" />}
              Undo
            </Button>
            <Button variant="destructive" size="sm" onClick={handleResetDraft} disabled={submitting}>
              {submitting && <Spinner className="mr-2" />}
              Reset
            </Button>
          </>
        )}
      </div>

      {/* Current turn indicator */}
      <Card className={canPick ? 'border-primary bg-primary/5' : ''}>
        <CardContent className="py-4 text-center space-y-3">
          {submitting ? (
            <div className="flex items-center justify-center gap-2">
              <Spinner />
              <p className="text-muted-foreground">Submitting pick...</p>
            </div>
          ) : isMyTurn ? (
            <p className="text-lg font-bold text-primary">Your Turn to Pick!</p>
          ) : adminPickMode ? (
            <div className="space-y-2">
              <p className="text-lg font-bold text-primary">
                Picking for {currentPicker?.pool_member?.profiles?.display_name}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setAdminPickMode(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground">
                Waiting for <span className="font-medium">{currentPicker?.pool_member?.profiles?.display_name}</span> to pick...
              </p>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setAdminPickMode(true)}>
                  Pick for {currentPicker?.pool_member?.profiles?.display_name}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Confirmation dialog */}
      {pendingPick && canPick && (
        <Card className="border-primary bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isMyTurn ? 'Confirm Your Pick' : `Confirm Pick for ${currentPicker?.pool_member?.profiles?.display_name}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {pendingPick.image_url && (
                <Image src={pendingPick.image_url} alt={pendingPick.name} width={48} height={48} className="h-12 w-12 rounded-full object-cover" />
              )}
              <div>
                <p className="text-lg font-bold">{pendingPick.name}</p>
                {pendingPick.country && (
                  <p className="text-sm text-muted-foreground">{pendingPick.country}</p>
                )}
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {pendingPick.odds_draftkings && <span>DK: {pendingPick.odds_draftkings}</span>}
                  {pendingPick.odds_mgm && <span>MGM: {pendingPick.odds_mgm}</span>}
                  {pendingPick.odds_betonline && <span>BOL: {pendingPick.odds_betonline}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConfirmPick} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                {submitting ? 'Submitting...' : 'Confirm Pick'}
              </Button>
              <Button variant="outline" onClick={() => setPendingPick(null)} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Golfer selection */}
      {canPick && !pendingPick && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Select a Golfer ({availableGolfers.length} available)</h2>
          </div>
          <input
            type="text"
            placeholder="Search golfers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-2 text-left">Golfer</th>
                  <th className="px-2 py-2 text-center">DK</th>
                  <th className="px-2 py-2 text-center">MGM</th>
                  <th className="px-2 py-2 text-center">BOL</th>
                </tr>
              </thead>
              <tbody>
                {availableGolfers.map((golfer) => (
                  <tr
                    key={golfer.id}
                    className={`cursor-pointer border-b transition-colors hover:bg-muted/50 ${submitting ? 'pointer-events-none opacity-50' : ''}`}
                    onClick={() => handleSelectGolfer(golfer)}
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        {golfer.image_url && (
                          <Image src={golfer.image_url} alt={golfer.name} width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
                        )}
                        <div>
                          <span className="font-medium">{golfer.name}</span>
                          {golfer.amateur && <Badge variant="outline" className="ml-1 text-[10px]">AM</Badge>}
                          {golfer.country && (
                            <span className="ml-1 text-xs text-muted-foreground">{golfer.country}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center text-xs">{golfer.odds_draftkings || '—'}</td>
                    <td className="px-2 py-2 text-center text-xs">{golfer.odds_mgm || '—'}</td>
                    <td className="px-2 py-2 text-center text-xs">{golfer.odds_betonline || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Separator />

      {/* Draft board */}
      <PgaDraftBoard picks={picks} members={members} numRounds={tournament.golfers_per_manager} />
    </div>
  )
}

function PgaDraftBoard({
  picks,
  members,
  numRounds,
}: {
  picks: { pick_number: number; round: number; member_id: string; golfer_name: string }[]
  members: PgaTournamentMember[]
  numRounds: number
}) {
  const rounds = Array.from({ length: numRounds }, (_, i) => i + 1)

  const memberPickMap = new Map<string, typeof picks>()
  for (const member of members) {
    memberPickMap.set(member.id, [])
  }
  for (const pick of picks) {
    if (memberPickMap.has(pick.member_id)) {
      memberPickMap.get(pick.member_id)!.push(pick)
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Draft Board</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Manager</th>
              {rounds.map((r) => (
                <th key={r} className="px-2 py-2 text-center font-medium text-muted-foreground">
                  R{r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...members]
              .sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))
              .map((member) => {
                const memberPicks = memberPickMap.get(member.id) ?? []
                return (
                  <tr key={member.id} className="border-b">
                    <td className="px-2 py-2 font-medium whitespace-nowrap">
                      {member.pool_member?.profiles?.display_name}
                    </td>
                    {rounds.map((r) => {
                      const pick = memberPicks.find((p) => p.round === r)
                      return (
                        <td key={r} className="px-2 py-2 text-center">
                          {pick ? (
                            <Badge variant="secondary" className="text-xs">
                              {pick.golfer_name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
