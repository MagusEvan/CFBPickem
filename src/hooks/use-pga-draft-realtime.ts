'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PgaDraftState, PgaDraftPick, PgaTournament } from '@/lib/types'

export function usePgaDraftRealtime(tournamentId: string) {
  const [draftState, setDraftState] = useState<PgaDraftState | null>(null)
  const [picks, setPicks] = useState<PgaDraftPick[]>([])
  const [tournamentStatus, setTournamentStatus] = useState<PgaTournament['draft_status'] | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])

  const fetchInitialState = useCallback(async () => {
    const [stateRes, picksRes, tournamentRes] = await Promise.all([
      supabase.from('pga_draft_state').select('*').eq('tournament_id', tournamentId).single(),
      supabase.from('pga_draft_picks').select('*').eq('tournament_id', tournamentId).order('pick_number'),
      supabase.from('pga_tournaments').select('draft_status').eq('id', tournamentId).single(),
    ])
    setDraftState(stateRes.data as PgaDraftState | null)
    setPicks((picksRes.data as PgaDraftPick[]) ?? [])
    setTournamentStatus(
      (tournamentRes.data as { draft_status: PgaTournament['draft_status'] } | null)?.draft_status ?? null
    )
    setLoading(false)
  }, [tournamentId, supabase])

  useEffect(() => {
    fetchInitialState()

    // Subscribe to pga_draft_state changes
    const stateChannel = supabase
      .channel(`pga-draft-state-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pga_draft_state',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setDraftState(null)
            setPicks([])
            setTournamentStatus('pre_draft')
          } else {
            setDraftState(payload.new as PgaDraftState)
          }
        }
      )
      .subscribe()

    // Subscribe to pga_draft_picks
    const picksChannel = supabase
      .channel(`pga-draft-picks-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pga_draft_picks',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPicks((prev) => [...prev, payload.new as PgaDraftPick])
          } else if (payload.eventType === 'DELETE') {
            fetchInitialState()
          }
        }
      )
      .subscribe()

    // Subscribe to tournament status changes
    const tournamentChannel = supabase
      .channel(`pga-tournament-status-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pga_tournaments',
          filter: `id=eq.${tournamentId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { draft_status: PgaTournament['draft_status'] }).draft_status
          setTournamentStatus(newStatus)
          if (newStatus === 'pre_draft') {
            setDraftState(null)
            setPicks([])
          }
          if (newStatus === 'in_progress') {
            fetchInitialState()
          }
        }
      )
      .subscribe()

    channelsRef.current = [stateChannel, picksChannel, tournamentChannel]

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(() => {
          fetchInitialState()
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      supabase.removeChannel(stateChannel)
      supabase.removeChannel(picksChannel)
      supabase.removeChannel(tournamentChannel)
    }
  }, [tournamentId, supabase, fetchInitialState])

  return { draftState, picks, tournamentStatus, loading, refetch: fetchInitialState }
}
