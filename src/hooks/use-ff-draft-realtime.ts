'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FFDraftState, FFDraftPick, FFAuctionBid } from '@/lib/ff/types'

const BID_FEED_SIZE = 30

/**
 * Live FF draft state via Supabase Realtime (ff_draft_state, ff_draft_picks,
 * and ff_auction_bids are in the publication), with a visibility-refetch
 * fallback for missed events while the tab was backgrounded.
 */
export function useFfDraftRealtime(poolId: string) {
  const [draftState, setDraftState] = useState<FFDraftState | null>(null)
  const [picks, setPicks] = useState<FFDraftPick[]>([])
  const [bids, setBids] = useState<FFAuctionBid[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchInitialState = useCallback(async () => {
    const [stateRes, picksRes, bidsRes] = await Promise.all([
      supabase.from('ff_draft_state').select('*').eq('pool_id', poolId).single(),
      supabase.from('ff_draft_picks').select('*').eq('pool_id', poolId).order('pick_number'),
      supabase
        .from('ff_auction_bids')
        .select('*')
        .eq('pool_id', poolId)
        .order('created_at', { ascending: false })
        .limit(BID_FEED_SIZE),
    ])
    setDraftState(stateRes.data as FFDraftState | null)
    setPicks((picksRes.data as FFDraftPick[]) ?? [])
    setBids(((bidsRes.data as FFAuctionBid[]) ?? []).reverse())
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

    const bidsChannel = supabase
      .channel(`ff-auction-bids-${poolId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ff_auction_bids', filter: `pool_id=eq.${poolId}` },
        (payload) => {
          const bid = payload.new as FFAuctionBid
          setBids((prev) =>
            prev.some((b) => b.id === bid.id) ? prev : [...prev, bid].slice(-BID_FEED_SIZE)
          )
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
      supabase.removeChannel(bidsChannel)
    }
  }, [poolId, supabase, fetchInitialState])

  return { draftState, picks, bids, loading, refetch: fetchInitialState }
}
