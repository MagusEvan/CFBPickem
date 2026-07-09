import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PoolMember, Profile } from '@/lib/types'
import type { FFDraftPick } from '@/lib/ff/types'

/** Auction rosters by manager: players with winning prices, budget spent. */
export function AuctionResults({
  members,
  picks,
  budget,
}: {
  members: (PoolMember & { profiles: Profile })[]
  picks: FFDraftPick[]
  budget: number
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => {
        const mine = picks
          .filter((p) => p.member_id === m.id)
          .sort((a, b) => (b.price ?? 0) - (a.price ?? 0) || a.pick_number - b.pick_number)
        const spent = mine.reduce((sum, p) => sum + (p.price ?? 0), 0)
        return (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-baseline justify-between text-sm">
                <span>{m.profiles.display_name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  ${spent} / ${budget}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5 text-xs">
              {mine.map((p) => (
                <div key={p.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="mr-1 font-semibold text-muted-foreground">
                      {p.player_position}
                    </span>
                    {p.player_name}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">${p.price ?? 0}</span>
                </div>
              ))}
              {mine.length === 0 && <p className="text-muted-foreground">No players yet.</p>}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
