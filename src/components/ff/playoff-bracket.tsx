import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface BracketGame {
  homeName: string
  /** null = bye */
  awayName: string | null
  homeSeed: number | null
  awaySeed: number | null
  homeScore: number
  awayScore: number
  final: boolean
  winner: 'home' | 'away' | null
}

export interface BracketRound {
  round: number
  name: string
  week: number
  games: BracketGame[]
}

export function PlayoffBracket({
  poolId,
  rounds,
  championName,
}: {
  poolId: string
  rounds: BracketRound[]
  championName: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Playoffs</span>
          {championName && (
            <Badge className="gap-1">
              <Trophy className="h-3 w-3" /> {championName} wins!
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="flex items-start gap-6">
          {rounds.map((r) => (
            <div key={r.round} className="min-w-44 flex-1 space-y-3">
              <Link
                href={`/pools/${poolId}/matchups/${r.week}`}
                className="text-sm font-semibold underline-offset-2 hover:underline"
              >
                {r.name}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  Week {r.week}
                </span>
              </Link>
              {r.games.map((g, i) => (
                <div key={i} className="rounded-md border text-sm">
                  <BracketSide
                    seed={g.homeSeed}
                    name={g.homeName}
                    score={g.awayName === null ? null : g.homeScore}
                    isWinner={g.winner === 'home'}
                    dimmed={g.final && g.winner === 'away'}
                  />
                  <div className="border-t" />
                  {g.awayName === null ? (
                    <p className="px-2 py-1.5 text-xs italic text-muted-foreground">Bye</p>
                  ) : (
                    <BracketSide
                      seed={g.awaySeed}
                      name={g.awayName}
                      score={g.awayScore}
                      isWinner={g.winner === 'away'}
                      dimmed={g.final && g.winner === 'home'}
                    />
                  )}
                </div>
              ))}
              {r.games.length === 0 && (
                <p className="text-xs italic text-muted-foreground">Awaiting results</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function BracketSide({
  seed,
  name,
  score,
  isWinner,
  dimmed,
}: {
  seed: number | null
  name: string
  score: number | null
  isWinner: boolean
  dimmed: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-2 py-1.5',
        isWinner && 'font-semibold',
        dimmed && 'text-muted-foreground'
      )}
    >
      <span className="min-w-0 truncate">
        {seed !== null && (
          <span className="mr-1.5 text-xs text-muted-foreground">{seed}</span>
        )}
        {name}
      </span>
      {score !== null && (
        <span className="shrink-0 font-mono text-xs tabular-nums">{score.toFixed(2)}</span>
      )}
    </div>
  )
}
