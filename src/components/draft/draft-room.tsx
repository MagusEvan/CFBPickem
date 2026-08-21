'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useDraftRealtime } from '@/hooks/use-draft-realtime'
import { startDraft, makePick, resetDraft, undoPick, generateWcScraps, setProjectionVisibility, refreshProjectedWins } from '@/lib/draft/actions'
import { generateSnakeOrder, getPickInfo, getAvailableConferences } from '@/lib/draft/engine'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import type { Pool, PoolMember, Profile, CachedTeam, WcScrapsTeam } from '@/lib/types'
import { ConferenceLogo } from '@/components/conference-logo'

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
  const [pendingPick, setPendingPick] = useState<CachedTeam | null>(null)
  const [adminPickMode, setAdminPickMode] = useState(false)
  const [wcScraps, setWcScraps] = useState<WcScrapsTeam[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const isWorldCup = pool.game_type === 'world_cup'

  // Use realtime pool status, falling back to server-rendered prop
  const draftStatus = poolStatus ?? pool.draft_status

  // Projected win totals: admins always see them; everyone else only while
  // the admin has flipped the live toggle (broadcast via draft_state realtime)
  const projectionsBroadcast = draftState?.show_projections ?? false
  const showProjections = !isWorldCup && ((pool.admin_id === currentUserId) || projectionsBroadcast)

  async function handleToggleProjections() {
    setError(null)
    try {
      await setProjectionVisibility(pool.id, !projectionsBroadcast)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle projections')
    }
  }

  async function handleRefreshProjections() {
    setSubmitting(true)
    setError(null)
    try {
      const result = await refreshProjectedWins(pool.id)
      if (result.unmatched.length > 0) {
        setError(`Updated ${result.updated} teams; unmatched: ${result.unmatched.join(', ')}`)
      }
      const res = await fetch(`/api/data/teams?year=${pool.season_year}`)
      if (res.ok) {
        const teams: CachedTeam[] = await res.json()
        setAllTeams(teams.filter((t) => t.conference_key && (pool.conferences ?? []).includes(t.conference_key)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh projections')
    }
    setSubmitting(false)
  }

  // Fetch WC scraps teams when draft is completed
  useEffect(() => {
    if (!isWorldCup || draftStatus !== 'completed') {
      setWcScraps([])
      return
    }
    const supabase = createClient()
    supabase
      .from('wc_scraps_teams')
      .select('*')
      .eq('pool_id', pool.id)
      .then(({ data }) => setWcScraps((data ?? []) as WcScrapsTeam[]))
  }, [isWorldCup, draftStatus, pool.id])

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

  // Reset selection state when turn changes
  useEffect(() => {
    setSelectedConference(null)
    setPendingPick(null)
    setAdminPickMode(false)
  }, [draftState?.current_pick_number])

  const draftedTeamIds = useMemo(() => new Set(picks.map((p) => p.team_id)), [picks])
  const projByTeamId = useMemo(
    () => new Map(allTeams.map((t) => [t.id, t.projected_wins])),
    [allTeams]
  )
  const isMyTurn = draftState?.current_member_id === currentMember?.id
  const currentPicker = members.find((m) => m.id === draftState?.current_member_id)
  // Admin can pick on behalf of the current picker after enabling proxy mode
  const canPick = isMyTurn || (isAdmin && adminPickMode && !!currentPicker)

  // Get conferences the current picker has already drafted from (CFB only)
  const pickerConferences = useMemo(() => {
    const pickerId = currentPicker?.id
    if (!pickerId || isWorldCup) return new Set<string>()
    return new Set(picks.filter((p) => p.member_id === pickerId).map((p) => p.conference_key))
  }, [picks, currentPicker, isWorldCup])

  const pickerBonusPick = useMemo(() => {
    const pickerId = currentPicker?.id
    if (!pickerId || isWorldCup) return false
    return picks.some((p) => p.member_id === pickerId && p.is_bonus_pick)
  }, [picks, currentPicker, isWorldCup])

  // Available conferences for current picker (CFB only)
  const availableConferences = useMemo(() => {
    if (!canPick || isWorldCup) return []
    return getAvailableConferences(
      conferences,
      pickerConferences,
      draftState?.pac12_ind_depleted ?? false,
      pickerBonusPick
    )
  }, [canPick, isWorldCup, conferences, pickerConferences, draftState?.pac12_ind_depleted, pickerBonusPick])

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

  async function handleGenerateScraps() {
    setSubmitting(true)
    setError(null)
    try {
      await generateWcScraps(pool.id)
      // Refetch scraps to display them
      const supabase = createClient()
      const { data } = await supabase
        .from('wc_scraps_teams')
        .select('*')
        .eq('pool_id', pool.id)
      setWcScraps((data ?? []) as WcScrapsTeam[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate scraps teams')
    }
    setSubmitting(false)
  }

  function handleSelectTeam(team: CachedTeam) {
    if (!canPick || submitting) return
    if (!isWorldCup && !selectedConference) return
    setPendingPick(team)
  }

  async function handleConfirmPick() {
    if (!pendingPick || !canPick || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await makePick(
        pool.id,
        pendingPick.id,
        pendingPick.name,
        pendingPick.conference_key ?? '',
        isWorldCup ? '' : selectedConference!,
        !isMyTurn ? currentPicker?.id : undefined
      )
      setPendingPick(null)
      setSelectedConference(null)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make pick')
    }
    setSubmitting(false)
  }

  function handleCancelPick() {
    setPendingPick(null)
  }

  // Pre-draft state
  if (draftStatus === 'pre_draft' || (!draftState && pool.draft_status === 'pre_draft')) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Draft - {pool.name}</h1>
        <Link href={`/pools/${pool.id}?view=details`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Pool
        </Link>
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
        <h1 className="text-2xl font-bold">Draft Complete - {pool.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/pools/${pool.id}?view=details`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
            &lt; Return to Pool
          </Link>
          {isAdmin && (
            <>
              {isWorldCup && (
                <Button variant="outline" size="sm" onClick={handleGenerateScraps} disabled={submitting}>
                  {submitting && <Spinner className="mr-2" />}
                  Generate Scraps Teams
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleUndoPick} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                Undo Last Pick
              </Button>
              <Button variant="destructive" size="sm" onClick={handleResetDraft} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                Reset Draft
              </Button>
              {!isWorldCup && (
                <>
                  <Button variant="outline" size="sm" onClick={handleRefreshProjections} disabled={submitting}>
                    Refresh Projections
                  </Button>
                  <Button
                    variant={projectionsBroadcast ? 'default' : 'outline'}
                    size="sm"
                    onClick={handleToggleProjections}
                  >
                    {projectionsBroadcast ? 'Projections: Visible to All' : 'Projections: Only You'}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {isWorldCup ? (
          <WcDraftBoard picks={picks} members={members} numRounds={pool.teams_per_manager ?? 1} />
        ) : (
          <DraftBoard picks={picks} members={members} conferences={conferences} showProjections={showProjections} projByTeamId={projByTeamId} />
        )}
        {wcScraps.length > 0 && (
          <WcScrapsBoard scraps={wcScraps} />
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
      <h1 className="text-2xl font-bold">Draft - {pool.name}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/pools/${pool.id}?view=details`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Pool
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
            {!isWorldCup && (
              <>
                <Button variant="outline" size="sm" onClick={handleRefreshProjections} disabled={submitting}>
                  Refresh Projections
                </Button>
                <Button
                  variant={projectionsBroadcast ? 'default' : 'outline'}
                  size="sm"
                  onClick={handleToggleProjections}
                >
                  {projectionsBroadcast ? 'Projections: Visible to All' : 'Projections: Only You'}
                </Button>
              </>
            )}
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
                Picking for {currentPicker?.profiles?.display_name}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setAdminPickMode(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground">
                Waiting for <span className="font-medium">{currentPicker?.profiles?.display_name}</span> to pick...
              </p>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setAdminPickMode(true)}>
                  Pick for {currentPicker?.profiles?.display_name}
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
              {isMyTurn ? 'Confirm Your Pick' : `Confirm Pick for ${currentPicker?.profiles?.display_name}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {pendingPick.logo_url && (
                <Image src={pendingPick.logo_url} alt={pendingPick.name} width={48} height={48} className="h-12 w-12 object-contain" />
              )}
              <div>
                <p className="text-lg font-bold">{pendingPick.name}</p>
                {!isWorldCup && selectedConference && (
                  <p className="text-sm text-muted-foreground">
                    from {CONFERENCE_LABELS[selectedConference] ?? selectedConference}
                  </p>
                )}
                {!isWorldCup && (
                  <p className="text-sm text-muted-foreground">
                    {pendingPick.wins}-{pendingPick.losses}
                  </p>
                )}
                {showProjections && pendingPick.projected_wins != null && (
                  <p className="text-sm font-medium text-primary">
                    Proj: {pendingPick.projected_wins} wins
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConfirmPick} disabled={submitting}>
                {submitting && <Spinner className="mr-2" />}
                {submitting ? 'Submitting...' : 'Confirm Pick'}
              </Button>
              <Button variant="outline" onClick={handleCancelPick} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* World Cup: Show all undrafted teams */}
      {isWorldCup && canPick && !pendingPick && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Select a Team</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableTeams.map((team) => (
              <Card
                key={team.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${submitting ? 'pointer-events-none opacity-50' : ''}`}
                onClick={() => handleSelectTeam(team)}
              >
                <CardContent className="flex items-center gap-3 py-3">
                  {team.logo_url && (
                    <Image src={team.logo_url} alt={team.name} width={32} height={32} className="h-8 w-8 object-contain" />
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
      {!isWorldCup && canPick && !selectedConference && !pendingPick && (
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
                  <CardContent className="flex items-center justify-between gap-2 py-3">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <ConferenceLogo conferenceKey={conf} size={28} />
                      <span className="truncate">{CONFERENCE_LABELS[conf] ?? conf}</span>
                    </span>
                    <Badge variant="secondary">{teamsInConf} teams</Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* CFB: Step 2: Team selector */}
      {!isWorldCup && canPick && selectedConference && !pendingPick && (
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
                onClick={() => handleSelectTeam(team)}
              >
                <CardContent className="flex items-center gap-3 py-3">
                  {team.logo_url && (
                    <Image src={team.logo_url} alt={team.name} width={32} height={32} className="h-8 w-8 object-contain" />
                  )}
                  <div>
                    <p className="font-medium">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {team.wins}-{team.losses}
                      {showProjections && team.projected_wins != null && (
                        <span className="ml-2 font-medium text-primary">
                          Proj: {team.projected_wins}
                        </span>
                      )}
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
        <DraftBoard picks={picks} members={members} conferences={conferences} showProjections={showProjections} projByTeamId={projByTeamId} />
      )}
    </div>
  )
}

// CFB Draft Board — conferences as columns
function DraftBoard({
  picks,
  members,
  conferences,
  showProjections,
  projByTeamId,
}: {
  picks: { pick_number: number; member_id: string | null; team_id: string; team_name: string; conference_key: string; is_bonus_pick: boolean }[]
  members: (PoolMember & { profiles: Profile })[]
  conferences: string[]
  showProjections: boolean
  projByTeamId: Map<string, number | null>
}) {
  const memberPickMap = new Map<string, typeof picks>()
  const memberNameMap = new Map<string, string>()
  for (const member of members) {
    memberPickMap.set(member.id, [])
    memberNameMap.set(member.id, member.profiles.display_name)
  }
  for (const pick of picks) {
    if (pick.member_id && memberPickMap.has(pick.member_id)) {
      memberPickMap.get(pick.member_id)!.push(pick)
    }
  }

  const sequentialPicks = [...picks].sort((a, b) => a.pick_number - b.pick_number)

  return (
    <div className="space-y-6 lg:relative lg:left-1/2 lg:w-[min(100vw-2rem,80rem)] lg:-translate-x-1/2">
      <div>
        <h2 className="mb-3 text-lg font-semibold">Draft Board</h2>
        <div className="overflow-x-auto lg:overflow-x-visible">
          <table className="w-full min-w-[56rem] text-sm lg:min-w-0 lg:table-fixed">
          <thead>
            <tr className="border-b">
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Manager</th>
              {conferences.map((conf) => (
                <th key={conf} className="px-2 py-2 text-center font-medium text-muted-foreground">
                  <span className="flex flex-col items-center gap-1">
                    <ConferenceLogo conferenceKey={conf} size={24} />
                    <span>{CONFERENCE_LABELS[conf] ?? conf}</span>
                  </span>
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

      {sequentialPicks.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Pick History</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Pick</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Manager</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Team</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Conference</th>
                {showProjections && (
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Proj W</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sequentialPicks.map((pick) => (
                <tr key={pick.pick_number} className="border-b">
                  <td className="px-2 py-2 text-muted-foreground">{pick.pick_number}</td>
                  <td className="px-2 py-2 font-medium">
                    {pick.member_id ? memberNameMap.get(pick.member_id) ?? '—' : '—'}
                  </td>
                  <td className="px-2 py-2">
                    {pick.team_name}
                    {pick.is_bonus_pick && ' *'}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-2">
                      <ConferenceLogo conferenceKey={pick.conference_key} size={20} />
                      {CONFERENCE_LABELS[pick.conference_key] ?? pick.conference_key}
                    </span>
                  </td>
                  {showProjections && (
                    <td className="px-2 py-2 text-right font-medium text-primary">
                      {projByTeamId.get(pick.team_id) ?? '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

// World Cup Scraps Board — shows scraps teams after draft completion
function WcScrapsBoard({ scraps }: { scraps: WcScrapsTeam[] }) {
  const teamNumbers = [...new Set(scraps.map((s) => s.scraps_team_number))].sort()

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Scraps Teams</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {teamNumbers.map((num) => {
          const teams = scraps.filter((s) => s.scraps_team_number === num)
          return (
            <Card key={num} className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Scraps Team {num}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {teams.map((t) => (
                    <Badge key={t.team_id} variant="outline" className="text-xs">
                      {t.team_name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
