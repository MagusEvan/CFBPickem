'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DraftState, DraftPick, Pool } from '@/lib/types'

export function useDraftRealtime(poolId: string) {
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [poolStatus, setPoolStatus] = useState<Pool['draft_status'] | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchInitialState = useCallback(async () => {
    const [stateRes, picksRes, poolRes] = await Promise.all([
      supabase.from('draft_state').select('*').eq('pool_id', poolId).single(),
      supabase.from('draft_picks').select('*').eq('pool_id', poolId).order('pick_number'),
      supabase.from('pools').select('draft_status').eq('id', poolId).single(),
    ])
    setDraftState(stateRes.data as DraftState | null)
    setPicks((picksRes.data as DraftPick[]) ?? [])
    setPoolStatus((poolRes.data as { draft_status: Pool['draft_status'] } | null)?.draft_status ?? null)
    setLoading(false)
  }, [poolId, supabase])

  useEffect(() => {
    fetchInitialState()

    // Subscribe to draft_state changes (INSERT for start, UPDATE for advance, DELETE for reset)
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
          if (payload.eventType === 'DELETE') {
            setDraftState(null)
            setPicks([])
            setPoolStatus('pre_draft')
          } else {
            setDraftState(payload.new as DraftState)
          }
        }
      )
      .subscribe()

    // Subscribe to picks (INSERT for new picks, DELETE for undo)
    const picksChannel = supabase
      .channel(`draft-picks-${poolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_picks',
          filter: `pool_id=eq.${poolId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPicks((prev) => [...prev, payload.new as DraftPick])
          } else if (payload.eventType === 'DELETE') {
            // Refetch all picks to get accurate state after undo
            fetchInitialState()
          }
        }
      )
      .subscribe()

    // Subscribe to pool status changes (for reset/complete)
    const poolChannel = supabase
      .channel(`pool-status-${poolId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pools',
          filter: `id=eq.${poolId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { draft_status: Pool['draft_status'] }).draft_status
          setPoolStatus(newStatus)
          if (newStatus === 'pre_draft') {
            setDraftState(null)
            setPicks([])
          }
          if (newStatus === 'in_progress') {
            // Draft just started — refetch to get state
            fetchInitialState()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(stateChannel)
      supabase.removeChannel(picksChannel)
      supabase.removeChannel(poolChannel)
    }
  }, [poolId, supabase, fetchInitialState])

  return { draftState, picks, poolStatus, loading, refetch: fetchInitialState }
}
