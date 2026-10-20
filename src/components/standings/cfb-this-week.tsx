'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchWeekGames } from './cfb-this-week-action'

interface TeamInfo {
  id: string
  name: string
  logoUrl: string | null
  wins: number
  losses: number
}

export interface GameInfo {
  id: string
  week: number
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  homeScore: number | null
  awayScore: number | null
  status: 'scheduled' | 'in_progress' | 'final'
  statusDetail: string | null
  startTime: string | null
}

interface ManagerTab {
  id: string
  label: string
  teamIds: string[]
}

export interface CfbThisWeekProps {
  managers: ManagerTab[]
  currentUserId: string | null
  initialGames: GameInfo[]
  teamMap: Record<string, TeamInfo>
  ownerByTeamId: Record<string, string>
  availableWeeks: number[]
  defaultWeek: number
  seasonYear: number
}

export function CfbThisWeek({
  managers,
  currentUserId,
  initialGames,
  teamMap,
  ownerByTeamId,
  availableWeeks,
  defaultWeek,
  seasonYear,
}: CfbThisWeekProps) {
  const currentUserManager = managers.find(
    (m) => m.id !== 'scraps' && currentUserId && m.id === currentUserId
  )
  const [selectedManagerId, setSelectedManagerId] = useState(
    currentUserManager?.id ?? managers[0]?.id ?? ''
  )
  const [selectedWeek, setSelectedWeek] = useState(defaultWeek)
  const [gamesByWeek, setGamesByWeek] = useState<Record<number, GameInfo[]>>({
    [defaultWeek]: initialGames,
  })
  const [isPending, startTransition] = useTransition()

  // Fetch games when week changes and we don't have them cached
  useEffect(() => {
    if (gamesByWeek[selectedWeek]) return
    startTransition(async () => {
      const games = await fetchWeekGames(seasonYear, selectedWeek)
      setGamesByWeek((prev) => ({ ...prev, [selectedWeek]: games }))
    })
  }, [selectedWeek, seasonYear, gamesByWeek])

  const games = gamesByWeek[selectedWeek] ?? []

  const selectedManager = managers.find((m) => m.id === selectedManagerId)
  const teamIds = useMemo(
    () => new Set(selectedManager?.teamIds ?? []),
    [selectedManager]
  )

  const weekGames = useMemo(
    () =>
      games
        .filter(
          (g) => teamIds.has(g.homeTeamId) || teamIds.has(g.awayTeamId)
        )
        .sort((a, b) => {
          const statusOrder = { final: 0, in_progress: 1, scheduled: 2 }
          const diff = statusOrder[a.status] - statusOrder[b.status]
          if (diff !== 0) return diff
          return (a.startTime ?? '').localeCompare(b.startTime ?? '')
        }),
    [games, teamIds]
  )

  const teamsWithGames = useMemo(() => {
    const set = new Set<string>()
    for (const g of weekGames) {
      if (teamIds.has(g.homeTeamId)) set.add(g.homeTeamId)
      if (teamIds.has(g.awayTeamId)) set.add(g.awayTeamId)
    }
    return set
  }, [weekGames, teamIds])

  const byeTeams = useMemo(
    () => [...teamIds].filter((id) => !teamsWithGames.has(id)),
    [teamIds, teamsWithGames]
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">This Week</CardTitle>
          <Select
            value={String(selectedWeek)}
            onValueChange={(v) => setSelectedWeek(Number(v))}
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableWeeks.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  Week {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Manager tabs */}
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {managers.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedManagerId(m.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedManagerId === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isPending && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Loading...
          </p>
        )}
        {!isPending && weekGames.length === 0 && byeTeams.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No games this week.
          </p>
        )}
        {!isPending && (
          <div className="grid gap-2 sm:grid-cols-2">
            {weekGames.map((game) => {
              const myTeamId = teamIds.has(game.homeTeamId)
                ? game.homeTeamId
                : game.awayTeamId
              const isHome = myTeamId === game.homeTeamId
              const myScore = isHome ? game.homeScore : game.awayScore
              const oppScore = isHome ? game.awayScore : game.homeScore
              const oppTeamId = isHome ? game.awayTeamId : game.homeTeamId
              const oppName = isHome ? game.awayTeamName : game.homeTeamName
              const myTeam = teamMap[myTeamId]
              const oppTeam = teamMap[oppTeamId]
              const oppOwner = ownerByTeamId[oppTeamId] ?? null

              let resultClass = ''
              let resultLabel = ''
              if (game.status === 'final') {
                if (myScore != null && oppScore != null) {
                  if (myScore > oppScore) {
                    resultClass = 'border-green-500/50 bg-green-500/10'
                    resultLabel = 'W'
                  } else if (myScore < oppScore) {
                    resultClass = 'border-red-500/50 bg-red-500/10'
                    resultLabel = 'L'
                  } else {
                    resultClass = 'border-yellow-500/50 bg-yellow-500/10'
                    resultLabel = 'T'
                  }
                }
              } else if (game.status === 'in_progress') {
                resultClass = 'border-blue-500/50 bg-blue-500/10'
              }

              return (
                <div
                  key={game.id}
                  className={`rounded-md border p-2 ${resultClass}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {myTeam?.logoUrl && (
                        <Image
                          src={myTeam.logoUrl}
                          alt={myTeam.name}
                          width={24}
                          height={24}
                          className="h-6 w-6 object-contain"
                        />
                      )}
                      <span className="text-sm font-medium">
                        {myTeam?.name ?? myTeamId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {game.status === 'final' && resultLabel && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            resultLabel === 'W'
                              ? 'border-green-500 text-green-600'
                              : resultLabel === 'L'
                                ? 'border-red-500 text-red-600'
                                : 'border-yellow-500 text-yellow-600'
                          }`}
                        >
                          {resultLabel}
                        </Badge>
                      )}
                      {game.status === 'in_progress' && (
                        <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
                          LIVE
                        </Badge>
                      )}
                      {(myScore != null || oppScore != null) && (
                        <span className="text-sm font-mono tabular-nums font-bold">
                          {myScore ?? 0}–{oppScore ?? 0}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span>{isHome ? 'vs' : '@'}</span>
                      {oppTeam?.logoUrl && (
                        <Image
                          src={oppTeam.logoUrl}
                          alt={oppName}
                          width={16}
                          height={16}
                          className="h-4 w-4 object-contain"
                        />
                      )}
                      <span>{oppName}</span>
                      {oppOwner && (
                        <span className="text-muted-foreground/60">({oppOwner})</span>
                      )}
                    </div>
                    <span>
                      {game.status === 'scheduled' && game.startTime
                        ? new Date(game.startTime).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : game.status === 'in_progress'
                          ? game.statusDetail ?? 'In Progress'
                          : game.status === 'final'
                            ? 'Final'
                            : ''}
                    </span>
                  </div>
                </div>
              )
            })}

            {byeTeams.map((id) => {
              const team = teamMap[id]
              return (
                <div
                  key={id}
                  className="rounded-md border border-dashed p-2 opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {team?.logoUrl && (
                        <Image
                          src={team.logoUrl}
                          alt={team?.name ?? id}
                          width={24}
                          height={24}
                          className="h-6 w-6 object-contain"
                        />
                      )}
                      <span className="text-sm font-medium">{team?.name ?? id}</span>
                    </div>
                    <span className="text-xs text-muted-foreground italic">BYE</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
