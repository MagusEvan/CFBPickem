'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDraftRealtime } from '@/hooks/use-draft-realtime'
import { startDraft, makePick, resetDraft, undoPick } from '@/lib/draft/actions'
import { generateSnakeOrder, getPickInfo, getAvailableConferences } from '@/lib/draft/engine'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import type { Pool, PoolMember, Profile, CachedTeam } from '@/lib/types'

const CONFERENCE_LABELS: Record<string, string> = {
  ACC: 'ACC', B12: 'Big 12', B1G: 'Big Ten', SEC: 'SEC',
  AAC: 'American Athletic', CUSA: 'Conference USA', MAC: 'MAC',
  MW: 'Mountain West', SBC: 'Sun Belt', PAC12_IND: 'Pac-12 / Ind',
}

interface DraftRoomProps {
  pool: Pool
  members: (PoolMember & { profiles: Profile })[]
  currentUserId: string
}

export function DraftRoom({ pool, members, currentUserId }: DraftRoomProps) {
  const { draftState, picks, poolStatus, loading, refetch } = useDraftRealtime(pool.id)
  const [allTeams, setAllTeams] = useState<CachedTeam[]>([])
  const [selectedConference, setSelectedConference] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const isWorldCup = pool.game_type === 'world_cup'

  // Use realtime pool status, falling back to server-rendered prop
  const draftStatus = poolStatus ?? pool.draft_status

  const currentMember = members.find((m) => m.user_id === currentUserId)
  const isAdmin = pool.admin_id === currentUserId
  const conferences = (pool.conferences ?? []) as string[]

  // Fetch all teams on mount
  useEffect(() => {
    async function fetchTeams() {
      if (isWorldCup) {
        const res = await fetch(`/api/data/wc-teams?year=${pool.season_year}`)
        if (res.ok) {
          const teams: CachedTeam[] = await res.json()
          setAllTeams(teams)
        }
      } else {
        const res = await fetch(`/api/data/teams?year=${pool.season_year}`)
        if (res.ok) {
          const teams: CachedTeam[] = await res.json()
          setAllTeams(teams.filter((t) => t.conference_key && conferences.includes(t.conference_key)))
        }
      }
    }
    fetchTeams()
  }, [pool.season_year, isWorldCup, conferences])

  // Reset selected conference when turn changes
  useEffect(() => {
    setSelectedConference(null)
  }, [draftState?.current_pick_number])

  const draftedTeamIds = useMemo(() => new Set(picks.map((p) => p.team_id)), [picks])
  const isMyTurn = draftState?.current_member_id === currentMember?.id
  const currentPicker = members.find((m) => m.id === draftState?.current_member_id)

  // Get conferences this manager has already drafted from (CFB only)
  const myConferences = useMemo(() => {
    if (!currentMember || isWorldCup) return new Set<string>()
    return new Set(picks.filter((p) => p.member_id === currentMember.id).map((p) => p.conference_key))
  }, [picks, currentMember, isWorldCup])

  const myBonusPick = useMemo(() => {
    if (!currentMember || isWorldCup) return false
    return picks.some((p) => p.member_id === currentMember.id && p.is_bonus_pick)
  }, [picks, currentMember, isWorldCup])

  // Available conferences for current picker (CFB only)
  const availableConferences = useMemo(() => {
    if (!isMyTurn || isWorldCup) return []
    return getAvailableConferences(
      conferences,
      myConferences,
      draftState?.pac12_ind_depleted ?? false,
      myBonusPick
    )
  }, [isMyTurn, isWorldCup, conferences, myConferences, draftState?.pac12_ind_depleted, myBonusPick])

  // Available teams in selected conference (CFB) or all undrafted (WC)
  const availableTeams = useMemo(() => {
    if (isWorldCup) {
      return allTeams
        .filter((t) => !draftedTeamIds.has(t.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    if (!selectedConference) return []
    return allTeams
      .filter((t) => t.conference_key === selectedConference && !draftedTeamIds.has(t.id))
      .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
  }, [isWorldCup, selectedConference, allTeams, draftedTeamIds])

  // Group WC teams by group letter for display
  const wcTeamsByGroup = useMemo(() => {
    if (!isWorldCup) return new Map<string, CachedTeam[]>()
    const groups = new Map<string, CachedTeam[]>()
    // We need group info — it's not in CachedTeam, so we use abbreviation trick:
    // For WC teams, the id is the FIFA code. We'll fetch group from static data
    // For now, group by first letter of id as placeholder... actually we should store group somewhere.
    // The WC teams API stores conference_key as null, but we can use the static data.
    // Let's group undrafted teams alphabetically by name for now and use the static teams data
    for (const team of availableTeams) {
      // Group letter isn't in cached_teams. We'll just show all undrafted teams sorted by name.
      const letter = team.name[0].toUpperCase()
      if (!groups.has(letter)) groups.set(letter, [])
      groups.get(letter)!.push(team)
    }
    return groups
  }, [isWorldCup, availableTeams])

  async function handleStartDraft() {
    setSubmitting(true)
    setError(null)
    try {
      await startDraft(pool.id)
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
      await resetDraft(pool.id)
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
      await undoPick(pool.id)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo pick')
    }
    setSubmitting(false)
  }

  async function handlePick(team: CachedTeam) {
    if (!isMyTurn || submitting) return
    if (!isWorldCup && !selectedConference) return
    setSubmitting(true)
    setError(null)
    try {
      await makePick(
        pool.id,
        team.id,
        team.name,
        team.conference_key ?? '',
        isWorldCup ? '' : selectedConference!
      )
      setSelectedConference(null)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make pick')
    }
    setSubmitting(false)
  }

  // Pre-draft state
  if (draftStatus === 'pre_draft' || (!draftState && pool.draft_status === 'pre_draft')) {
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Draft Complete - {pool.name}</h1>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleUndoPick} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                Undo Last Pick
              </Button>
              <Button variant="destructive" size="sm" onClick={handleResetDraft} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                Reset Draft
              </Button>
            </div>
          )}
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {isWorldCup ? (
          <WcDraftBoard picks={picks} members={members} numRounds={pool.teams_per_manager ?? 1} />
        ) : (
          <DraftBoard picks={picks} members={members} conferences={conferences} />
        )}
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Draft - {pool.name}</h1>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Round {draftState?.current_round} &middot; Pick {draftState?.current_pick_number}
          </p>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleUndoPick} disabled={submitting || picks.length === 0}>
                {submitting && <Spinner className="mr-2" />}
                Undo
              </Button>
              <Button variant="destructive" size="sm" onClick={handleResetDraft} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                Reset
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Current turn indicator */}
      <Card className={isMyTurn ? 'border-primary bg-primary/5' : ''}>
        <CardContent className="py-4 text-center">
          {submitting ? (
            <div className="flex items-center justify-center gap-2">
              <Spinner />
              <p className="text-muted-foreground">Submitting pick...</p>
            </div>
          ) : isMyTurn ? (
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

      {/* World Cup: Show all undrafted teams */}
      {isWorldCup && isMyTurn && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Select a Team</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableTeams.map((team) => (
              <Card
                key={team.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${submitting ? 'pointer-events-none opacity-50' : ''}`}
                onClick={() => handlePick(team)}
              >
                <CardContent className="flex items-center gap-3 py-3">
                  {team.logo_url && (
                    <img src={team.logo_url} alt={team.name} className="h-8 w-8 object-contain" />
                  )}
                  <div>
                    <p className="font-medium">{team.name}</p>
                    <p className="text-xs text-muted-foreground">{team.abbreviation}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* CFB: Step 1: Conference selector */}
      {!isWorldCup && isMyTurn && !selectedConference && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Select a Conference</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableConferences.map((conf) => {
              const teamsInConf = allTeams.filter(
                (t) => t.conference_key === conf && !draftedTeamIds.has(t.id)
              ).length
              return (
                <Card
                  key={conf}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${submitting ? 'pointer-events-none opacity-50' : ''}`}
                  onClick={() => setSelectedConference(conf)}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <span className="font-medium">{CONFERENCE_LABELS[conf] ?? conf}</span>
                    <Badge variant="secondary">{teamsInConf} teams</Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* CFB: Step 2: Team selector */}
      {!isWorldCup && isMyTurn && selectedConference && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Select a Team from {CONFERENCE_LABELS[selectedConference] ?? selectedConference}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedConference(null)}>
              Back to Conferences
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableTeams.map((team) => (
              <Card
                key={team.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${submitting ? 'pointer-events-none opacity-50' : ''}`}
                onClick={() => handlePick(team)}
              >
                <CardContent className="flex items-center gap-3 py-3">
                  {team.logo_url && (
                    <img src={team.logo_url} alt={team.name} className="h-8 w-8 object-contain" />
                  )}
                  <div>
                    <p className="font-medium">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {team.wins}-{team.losses}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Draft board */}
      {isWorldCup ? (
        <WcDraftBoard picks={picks} members={members} numRounds={pool.teams_per_manager ?? 1} />
      ) : (
        <DraftBoard picks={picks} members={members} conferences={conferences} />
      )}
    </div>
  )
}

// CFB Draft Board — conferences as columns
function DraftBoard({
  picks,
  members,
  conferences,
}: {
  picks: { pick_number: number; member_id: string | null; team_name: string; conference_key: string; is_bonus_pick: boolean }[]
  members: (PoolMember & { profiles: Profile })[]
  conferences: string[]
}) {
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
              {conferences.map((conf) => (
                <th key={conf} className="px-2 py-2 text-center font-medium text-muted-foreground">
                  {CONFERENCE_LABELS[conf] ?? conf}
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
                    <td className="px-2 py-2 font-medium whitespace-nowrap">
                      {member.profiles.display_name}
                    </td>
                    {conferences.map((conf) => {
                      const pick = memberPicks.find((p) => p.conference_key === conf && !p.is_bonus_pick)
                      const bonusPick = memberPicks.find((p) => p.conference_key === conf && p.is_bonus_pick)

                      return (
                        <td key={conf} className="px-2 py-2 text-center">
                          {pick && (
                            <Badge variant="secondary" className="text-xs">
                              {pick.team_name}
                            </Badge>
                          )}
                          {bonusPick && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {bonusPick.team_name} *
                            </Badge>
                          )}
                          {!pick && !bonusPick && (
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

// World Cup Draft Board — rounds as columns
function WcDraftBoard({
  picks,
  members,
  numRounds,
}: {
  picks: { pick_number: number; round: number; member_id: string | null; team_name: string }[]
  members: (PoolMember & { profiles: Profile })[]
  numRounds: number
}) {
  const rounds = Array.from({ length: numRounds }, (_, i) => i + 1)

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
              {rounds.map((r) => (
                <th key={r} className="px-2 py-2 text-center font-medium text-muted-foreground">
                  Round {r}
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
                    <td className="px-2 py-2 font-medium whitespace-nowrap">
                      {member.profiles.display_name}
                    </td>
                    {rounds.map((r) => {
                      const pick = memberPicks.find((p) => p.round === r)
                      return (
                        <td key={r} className="px-2 py-2 text-center">
                          {pick ? (
                            <Badge variant="secondary" className="text-xs">
                              {pick.team_name}
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
