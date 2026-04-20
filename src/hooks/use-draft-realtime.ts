'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DraftState, DraftPick } from '@/lib/types'

export function useDraftRealtime(poolId: string) {
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchInitialState = useCallback(async () => {
    const [stateRes, picksRes] = await Promise.all([
      supabase.from('draft_state').select('*').eq('pool_id', poolId).single(),
      supabase.from('draft_picks').select('*').eq('pool_id', poolId).order('pick_number'),
    ])
    setDraftState(stateRes.data as DraftState | null)
    setPicks((picksRes.data as DraftPick[]) ?? [])
    setLoading(false)
  }, [poolId, supabase])

  useEffect(() => {
    fetchInitialState()

    // Subscribe to draft_state changes
    const stateChannel = supabase
      .channel(`draft-state-${poolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_state',
          filter: `pool_id=eq.${poolId}`,
        },
        (payload) => {
          setDraftState(payload.new as DraftState)
        }
      )
      .subscribe()

    // Subscribe to new picks
    const picksChannel = supabase
      .channel(`draft-picks-${poolId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'draft_picks',
          filter: `pool_id=eq.${poolId}`,
        },
        (payload) => {
          setPicks((prev) => [...prev, payload.new as DraftPick])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(stateChannel)
      supabase.removeChannel(picksChannel)
    }
  }, [poolId, supabase, fetchInitialState])

  return { draftState, picks, loading, refetch: fetchInitialState }
}
