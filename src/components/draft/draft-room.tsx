'use client'

import { useState, useEffect } from 'react'
import { useDraftRealtime } from '@/hooks/use-draft-realtime'
import { startDraft, makePick } from '@/lib/draft/actions'
import { generateSnakeOrder, getPickInfo, getConferenceForRound } from '@/lib/draft/engine'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Pool, PoolMember, Profile, CachedTeam } from '@/lib/types'

interface DraftRoomProps {
  pool: Pool
  members: (PoolMember & { profiles: Profile })[]
  currentUserId: string
}

export function DraftRoom({ pool, members, currentUserId }: DraftRoomProps) {
  const { draftState, picks, loading } = useDraftRealtime(pool.id)
  const [availableTeams, setAvailableTeams] = useState<CachedTeam[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftStatus, setDraftStatus] = useState(pool.draft_status)

  const currentMember = members.find((m) => m.user_id === currentUserId)
  const isAdmin = pool.admin_id === currentUserId
  const conferences = pool.conferences as string[]

  // Fetch available teams for the current conference
  useEffect(() => {
    if (!draftState?.conference_key) return

    async function fetchTeams() {
      const conferenceKey = draftState!.conference_key!
      const res = await fetch(
        `/api/data/teams?conference=${conferenceKey}&year=${pool.season_year}`
      )
      if (res.ok) {
        const teams = await res.json()
        setAvailableTeams(teams)
      }
    }

    // If pac12 depleted, fetch all teams from pool conferences
    if (draftState.pac12_ind_depleted && draftState.conference_key === 'PAC12_IND') {
      async function fetchAllTeams() {
        const res = await fetch(`/api/data/teams?year=${pool.season_year}`)
        if (res.ok) {
          const teams: CachedTeam[] = await res.json()
          // Filter to pool conferences except PAC12_IND
          setAvailableTeams(
            teams.filter((t) =>
              t.conference_key &&
              conferences.includes(t.conference_key) &&
              t.conference_key !== 'PAC12_IND'
            )
          )
        }
      }
      fetchAllTeams()
    } else {
      fetchTeams()
    }
  }, [draftState?.conference_key, draftState?.pac12_ind_depleted, pool.season_year, conferences])

  // Track draft completion via realtime
  useEffect(() => {
    if (draftState) {
      const snakeOrder = generateSnakeOrder({ managerCount: members.length, conferences })
      if (draftState.current_pick_number > snakeOrder.length) {
        setDraftStatus('completed')
      }
    }
  }, [draftState, members.length, conferences])

  const draftedTeamIds = new Set(picks.map((p) => p.team_id))
  const undraftedTeams = availableTeams.filter((t) => !draftedTeamIds.has(t.id))

  const isMyTurn = draftState?.current_member_id === currentMember?.id
  const currentPicker = members.find((m) => m.id === draftState?.current_member_id)

  async function handleStartDraft() {
    setSubmitting(true)
    setError(null)
    try {
      await startDraft(pool.id)
      setDraftStatus('in_progress')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft')
    }
    setSubmitting(false)
  }

  async function handlePick(team: CachedTeam) {
    if (!isMyTurn || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await makePick(pool.id, team.id, team.name, team.conference_key!)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make pick')
    }
    setSubmitting(false)
  }

  // Pre-draft state
  if (draftStatus === 'pre_draft') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Draft - {pool.name}</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-lg text-muted-foreground">
              Waiting to start the draft ({members.length}/{pool.max_managers} managers)
            </p>
            {isAdmin && (
              <Button onClick={handleStartDraft} disabled={submitting || members.length < 2}>
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
        <h1 className="text-2xl font-bold">Draft Complete - {pool.name}</h1>
        <DraftBoard picks={picks} members={members} conferences={conferences} managerCount={members.length} />
      </div>
    )
  }

  // Active draft
  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading draft...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Draft - {pool.name}</h1>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">
            Round {draftState?.current_round} &middot; Pick {draftState?.current_pick_number}
          </p>
          <p className="font-medium">
            {draftState?.conference_key}
            {draftState?.pac12_ind_depleted && draftState?.conference_key === 'PAC12_IND' &&
              ' (Depleted - Bonus Pick)'}
          </p>
        </div>
      </div>

      {/* Current turn indicator */}
      <Card className={isMyTurn ? 'border-primary bg-primary/5' : ''}>
        <CardContent className="py-4 text-center">
          {isMyTurn ? (
            <p className="text-lg font-bold text-primary">Your Turn to Pick!</p>
          ) : (
            <p className="text-muted-foreground">
              Waiting for <span className="font-medium">{currentPicker?.profiles?.display_name}</span> to pick...
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Available teams */}
      {isMyTurn && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Available Teams ({undraftedTeams.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {undraftedTeams.map((team) => (
              <Card
                key={team.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => handlePick(team)}
              >
                <CardContent className="flex items-center gap-3 py-3">
                  {team.logo_url && (
                    <img src={team.logo_url} alt={team.name} className="h-8 w-8 object-contain" />
                  )}
                  <div>
                    <p className="font-medium">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {team.wins}-{team.losses} &middot; {team.conference_key}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Draft board */}
      <DraftBoard picks={picks} members={members} conferences={conferences} managerCount={members.length} />
    </div>
  )
}

function DraftBoard({
  picks,
  members,
  conferences,
  managerCount,
}: {
  picks: { pick_number: number; member_id: string | null; team_name: string; conference_key: string; is_bonus_pick: boolean }[]
  members: (PoolMember & { profiles: Profile })[]
  conferences: string[]
  managerCount: number
}) {
  const snakeOrder = generateSnakeOrder({ managerCount, conferences })

  // Group picks by member
  const memberPickMap = new Map<string, typeof picks>()
  for (const member of members) {
    memberPickMap.set(member.id, [])
  }
  for (const pick of picks) {
    if (pick.member_id && memberPickMap.has(pick.member_id)) {
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
              {conferences.map((conf, i) => (
                <th key={conf} className="px-2 py-2 text-center font-medium text-muted-foreground">
                  {conf}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members
              .sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))
              .map((member) => {
                const memberPicks = memberPickMap.get(member.id) ?? []
                return (
                  <tr key={member.id} className="border-b">
                    <td className="px-2 py-2 font-medium">
                      {member.profiles.display_name}
                    </td>
                    {conferences.map((conf) => {
                      const pick = memberPicks.find(
                        (p) => p.conference_key === conf || (p.is_bonus_pick && p.conference_key === conf)
                      )
                      // Also check for bonus picks where the team's actual conference matches
                      const bonusPick = memberPicks.find(
                        (p) => p.is_bonus_pick && p.conference_key === 'PAC12_IND'
                      )
                      const displayPick = conf === 'PAC12_IND' && !pick ? undefined : pick

                      return (
                        <td key={conf} className="px-2 py-2 text-center">
                          {displayPick ? (
                            <Badge variant="secondary" className="text-xs">
                              {displayPick.team_name}
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
