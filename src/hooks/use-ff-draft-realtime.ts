'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FFDraftState, FFDraftPick } from '@/lib/ff/types'

/**
 * Live FF draft state via Supabase Realtime (ff_draft_state + ff_draft_picks
 * are in the publication), with a visibility-refetch fallback for missed
 * events while the tab was backgrounded.
 */
export function useFfDraftRealtime(poolId: string) {
  const [draftState, setDraftState] = useState<FFDraftState | null>(null)
  const [picks, setPicks] = useState<FFDraftPick[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchInitialState = useCallback(async () => {
    const [stateRes, picksRes] = await Promise.all([
      supabase.from('ff_draft_state').select('*').eq('pool_id', poolId).single(),
      supabase.from('ff_draft_picks').select('*').eq('pool_id', poolId).order('pick_number'),
    ])
    setDraftState(stateRes.data as FFDraftState | null)
    setPicks((picksRes.data as FFDraftPick[]) ?? [])
    setLoading(false)
  }, [poolId, supabase])

  useEffect(() => {
    // False positive: setState happens after the awaited fetch, not synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInitialState()

    const stateChannel = supabase
      .channel(`ff-draft-state-${poolId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ff_draft_state', filter: `pool_id=eq.${poolId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setDraftState(null)
            setPicks([])
          } else {
            setDraftState(payload.new as FFDraftState)
          }
        }
      )
      .subscribe()

    const picksChannel = supabase
      .channel(`ff-draft-picks-${poolId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ff_draft_picks', filter: `pool_id=eq.${poolId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const pick = payload.new as FFDraftPick
            setPicks((prev) =>
              prev.some((p) => p.id === pick.id) ? prev : [...prev, pick].sort((a, b) => a.pick_number - b.pick_number)
            )
          } else {
            // DELETE (undo/reset) — refetch for a consistent view
            fetchInitialState()
          }
        }
      )
      .subscribe()

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
    }
  }, [poolId, supabase, fetchInitialState])

  return { draftState, picks, loading, refetch: fetchInitialState }
}
