'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { createTournament } from '@/lib/pga/actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PoolMemberInfo {
  id: string
  display_name: string
}

interface EspnEvent {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  venue: string | null
  coursePar?: number | null
  status: string
}

export default function NewTournamentPage({
  params,
}: {
  params: Promise<{ poolId: string }>
}) {
  const { poolId } = use(params)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<EspnEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<EspnEvent | null>(null)
  const [name, setName] = useState('')
  const [golfersPerManager, setGolfersPerManager] = useState(7)
  const [topNScoring, setTopNScoring] = useState(5)
  const [enableScraps, setEnableScraps] = useState(false)
  const [coursePar, setCoursePar] = useState(72)
  const [missedCutScore, setMissedCutScore] = useState(80)
  const [members, setMembers] = useState<PoolMemberInfo[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [loadingMembers, setLoadingMembers] = useState(true)
  const seasonYear = new Date().getFullYear()

  useEffect(() => {
    async function loadData() {
      // Load members
      const supabase = createClient()
      const { data: memberData } = await supabase
        .from('pool_members')
        .select('id, profiles(display_name)')
        .eq('pool_id', poolId)
        .order('joined_at')
      const mapped = (memberData ?? []).map((m) => ({
        id: m.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        display_name: (m.profiles as any)?.display_name ?? 'Unknown',
      }))
      setMembers(mapped)
      setSelectedMemberIds(new Set(mapped.map((m) => m.id)))
      setLoadingMembers(false)

      // Load events
      try {
        const res = await fetch(`/api/data/pga-events?year=${seasonYear}`)
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events || [])
        }
      } catch {
        // Non-fatal
      } finally {
        setLoadingEvents(false)
      }
    }
    loadData()
  }, [poolId, seasonYear])

  function selectEvent(event: EspnEvent) {
    setSelectedEvent(event)
    setName(event.name)
    if (event.coursePar) setCoursePar(event.coursePar)
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    try {
      formData.set('pool_id', poolId)
      formData.set('name', name)
      formData.set('season_year', String(seasonYear))
      formData.set('golfers_per_manager', String(golfersPerManager))
      formData.set('top_n_scoring', String(topNScoring))
      formData.set('enable_scraps', String(enableScraps))
      formData.set('course_par', String(coursePar))
      formData.set('missed_cut_score', String(missedCutScore))
      formData.set('draft_order_mode', 'random')
      if (selectedEvent) {
        formData.set('espn_event_id', selectedEvent.id)
        if (selectedEvent.startDate) formData.set('start_date', selectedEvent.startDate.split('T')[0])
        if (selectedEvent.endDate) formData.set('end_date', selectedEvent.endDate.split('T')[0])
      }
      for (const id of selectedMemberIds) {
        formData.append('member_ids', id)
      }
      await createTournament(formData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isValid = name.length > 0 && topNScoring <= golfersPerManager && selectedMemberIds.size >= 2

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/pools/${poolId}/tournaments`}
          className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Tournament</CardTitle>
        </CardHeader>
        <form action={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            {/* Event selection */}
            <div className="space-y-2">
              <Label>PGA Major Event</Label>
              {loadingEvents ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Loading events...
                </div>
              ) : events.length > 0 ? (
                <div className="grid gap-2">
                  {events.map((event) => {
                    const isCompleted = event.status === 'STATUS_FINAL'
                    const isLive = event.status === 'STATUS_IN_PROGRESS'
                    const isDisabled = isCompleted || isLive
                    return (
                      <button
                        key={event.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && selectEvent(event)}
                        className={`rounded-md border p-3 text-left text-sm transition-colors ${
                          isDisabled
                            ? 'opacity-50 cursor-not-allowed border-border'
                            : selectedEvent?.id === event.id
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        <p className={`font-medium ${isDisabled ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {event.name}
                          {isCompleted && <span className="ml-2 text-xs font-normal text-muted-foreground">(Completed)</span>}
                          {isLive && <span className="ml-2 text-xs font-normal text-muted-foreground">(In Progress)</span>}
                        </p>
                        <p className="text-xs">
                          {event.startDate
                            ? new Date(event.startDate).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })
                            : 'TBD'}
                          {event.venue && ` · ${event.venue}`}
                        </p>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No major events found for {seasonYear}. You can create a custom tournament below.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Tournament Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. The Masters 2026"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="golfers_per_manager">Golfers per Manager</Label>
                <Input
                  id="golfers_per_manager"
                  type="number"
                  value={golfersPerManager}
                  onChange={(e) => setGolfersPerManager(Number(e.target.value))}
                  min={1}
                  max={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="top_n_scoring">Top N Scoring</Label>
                <Input
                  id="top_n_scoring"
                  type="number"
                  value={topNScoring}
                  onChange={(e) => setTopNScoring(Number(e.target.value))}
                  min={1}
                  max={golfersPerManager}
                />
                <p className="text-xs text-muted-foreground">
                  Best {topNScoring} of {golfersPerManager} scores count per round
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="course_par">Course Par</Label>
                <Input
                  id="course_par"
                  type="number"
                  value={coursePar}
                  onChange={(e) => setCoursePar(Number(e.target.value))}
                  min={60}
                  max={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="missed_cut_score">Missed Cut Score</Label>
                <Input
                  id="missed_cut_score"
                  type="number"
                  value={missedCutScore}
                  onChange={(e) => setMissedCutScore(Number(e.target.value))}
                  min={70}
                  max={100}
                />
                <p className="text-xs text-muted-foreground">
                  Strokes assigned per round for CUT/WD golfers
                </p>
              </div>
            </div>

            {/* Participant selection */}
            <div className="space-y-2">
              <Label>Participants ({selectedMemberIds.size} of {members.length})</Label>
              {loadingMembers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Loading managers...
                </div>
              ) : (
                <div className="space-y-1">
                  {members.map((m) => (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
                        selectedMemberIds.has(m.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.has(m.id)}
                        onChange={() => toggleMember(m.id)}
                        className="accent-primary"
                      />
                      {m.display_name}
                    </label>
                  ))}
                  {selectedMemberIds.size < 2 && (
                    <p className="text-xs text-red-600">Select at least 2 participants.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableScraps}
                  onChange={(e) => setEnableScraps(e.target.checked)}
                  className="accent-primary"
                />
                <span className="text-sm">Create scraps team(s) from undrafted golfers</span>
              </label>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading || !isValid}>
              {loading && <Spinner className="mr-2" />}
              {loading ? 'Creating...' : 'Create Tournament'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
