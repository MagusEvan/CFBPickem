'use client'

import { useFfMatchupPoll } from '@/hooks/use-ff-matchup-poll'

/** Invisible: keeps score-bearing FF pages fresh while NFL games are live. */
export function MatchupLive({ anyGameLive }: { anyGameLive: boolean }) {
  useFfMatchupPoll(anyGameLive)
  return null
}
