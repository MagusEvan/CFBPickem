'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PgaDraftState, PgaCalcuttaLot, PgaCalcuttaBid, PgaTournament } from '@/lib/types'

export function useCalcuttaRealtime(tournamentId: string) {
  const [draftState, setDraftState] = useState<PgaDraftState | null>(null)
  const [lots, setLots] = useState<PgaCalcuttaLot[]>([])
  const [bids, setBids] = useState<PgaCalcuttaBid[]>([])
  const [tournamentStatus, setTournamentStatus] = useState<PgaTournament['draft_status'] | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])

  const fetchInitialState = useCallback(async () => {
    const [stateRes, lotsRes, bidsRes, tournamentRes] = await Promise.all([
      supabase.from('pga_draft_state').select('*').eq('tournament_id', tournamentId).single(),
      supabase.from('pga_calcutta_lots').select('*').eq('tournament_id', tournamentId).order('lot_order'),
      supabase
        .from('pga_calcutta_bids')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('pga_tournaments').select('draft_status').eq('id', tournamentId).single(),
    ])
    setDraftState(stateRes.data as PgaDraftState | null)
    setLots((lotsRes.data as PgaCalcuttaLot[]) ?? [])
    setBids((bidsRes.data as PgaCalcuttaBid[]) ?? [])
    setTournamentStatus(
      (tournamentRes.data as { draft_status: PgaTournament['draft_status'] } | null)?.draft_status ?? null
    )
    setLoading(false)
  }, [tournamentId, supabase])

  useEffect(() => {
    fetchInitialState()

    const stateChannel = supabase
      .channel(`calcutta-state-${tournamentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pga_draft_state', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            fetchInitialState()
          } else {
            setDraftState(payload.new as PgaDraftState)
          }
        }
      )
      .subscribe()

    const lotsChannel = supabase
      .channel(`calcutta-lots-${tournamentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pga_calcutta_lots', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const lot = payload.new as PgaCalcuttaLot
            setLots((prev) => prev.map((l) => (l.id === lot.id ? lot : l)))
          } else {
            // Inserts/deletes (lot regeneration) — refetch the whole list
            fetchInitialState()
          }
        }
      )
      .subscribe()

    const bidsChannel = supabase
      .channel(`calcutta-bids-${tournamentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pga_calcutta_bids', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          setBids((prev) => [payload.new as PgaCalcuttaBid, ...prev].slice(0, 50))
        }
      )
      .subscribe()

    const tournamentChannel = supabase
      .channel(`calcutta-tournament-${tournamentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pga_tournaments', filter: `id=eq.${tournamentId}` },
        (payload) => {
          const newStatus = (payload.new as { draft_status: PgaTournament['draft_status'] }).draft_status
          setTournamentStatus(newStatus)
          fetchInitialState()
        }
      )
      .subscribe()

    channelsRef.current = [stateChannel, lotsChannel, bidsChannel, tournamentChannel]

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
      for (const ch of channelsRef.current) supabase.removeChannel(ch)
    }
  }, [tournamentId, supabase, fetchInitialState])

  return { draftState, lots, bids, tournamentStatus, loading, refetch: fetchInitialState }
}
