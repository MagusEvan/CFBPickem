'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { useIsDesktop } from '@/hooks/use-media-query'
import type { GamePointBreakdown } from '@/lib/scoring/strategies/world-cup'

export interface TeamBreakdownItem {
  teamId: string
  teamName: string
  points: number
  gamesPlayed: number
  round: number | null
  eliminated: boolean
  gameBreakdowns: GamePointBreakdown[]
}

export function TeamBreakdownGrid({ teams }: { teams: TeamBreakdownItem[] }) {
  const isDesktop = useIsDesktop()
  const [allOpen, setAllOpen] = useState(false) // desktop: one state for the whole grid
  const [openTeams, setOpenTeams] = useState<Set<string>>(new Set()) // mobile: per-team

  const handleToggle = (teamId: string) => {
    if (isDesktop) {
      setAllOpen((v) => !v)
    } else {
      setOpenTeams((prev) => {
        const next = new Set(prev)
        if (next.has(teamId)) next.delete(teamId)
        else next.add(teamId)
        return next
      })
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {teams.map((tb) => (
        <details
          key={tb.teamId}
          open={isDesktop ? allOpen : openTeams.has(tb.teamId)}
          className={`rounded-md border ${tb.eliminated ? 'bg-red-100/60 dark:bg-red-950/40' : ''}`}
        >
          <summary
            className="flex cursor-pointer list-none items-center justify-between p-2"
            onClick={(e) => {
              e.preventDefault()
              handleToggle(tb.teamId)
            }}
          >
            <span className="text-sm font-medium">
              {tb.teamName}
              {tb.round != null && (
                <span className="ml-1 font-normal text-muted-foreground">(r{tb.round})</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {tb.gamesPlayed} GP
              </Badge>
              <span className="text-sm font-bold">{tb.points} pts</span>
            </div>
          </summary>
          {tb.gameBreakdowns.length > 0 ? (
            <div className="space-y-1 border-t px-2 py-2">
              {tb.gameBreakdowns.map((gb) => (
                <div key={gb.gameId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1">{gb.result}</Badge>
                    <span>vs {gb.opponent}</span>
                    <span className="text-muted-foreground">{gb.myGoals}–{gb.oppGoals}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {gb.itemized.map((item, i) => (
                      <span key={i}>{item.label}: +{item.value}</span>
                    ))}
                    <span className="font-bold text-foreground">{gb.points} pts</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-t px-2 py-2 text-xs text-muted-foreground">
              No completed games yet
            </div>
          )}
        </details>
      ))}
    </div>
  )
}
