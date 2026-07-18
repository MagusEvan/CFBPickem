import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getGame, isGameType } from '@/lib/games/registry'
import type { ChampionshipRow } from '@/lib/pools/championship-actions'

export const revalidate = 300

function gameName(gameType: string): string {
  return isGameType(gameType) ? getGame(gameType).name : gameType
}

export default async function ProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [profileRes, championshipsRes, membershipsRes] = await Promise.all([
    admin.from('profiles').select('id,display_name,created_at').eq('id', userId).maybeSingle(),
    admin
      .from('pool_championships')
      .select('pool_id,game_type,season_year,finalized_at,final_standings,pools(name)')
      .eq('champion_user_id', userId)
      .order('season_year', { ascending: false }),
    admin
      .from('pool_members')
      .select('pool_id,pools(id,name,game_type,season_year)')
      .eq('user_id', userId),
  ])

  const profile = profileRes.data
  if (!profile) notFound()

  const championships = (championshipsRes.data ?? []) as unknown as Array<{
    pool_id: string
    game_type: string
    season_year: number
    finalized_at: string
    final_standings: ChampionshipRow[]
    pools: { name: string } | null
  }>

  const memberships = ((membershipsRes.data ?? []) as unknown as Array<{
    pool_id: string
    pools: { id: string; name: string; game_type: string; season_year: number } | null
  }>)
    .filter((m) => m.pools)
    .sort((a, b) => b.pools!.season_year - a.pools!.season_year)

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{profile.display_name}</h1>
        <p className="text-sm text-muted-foreground">
          Member since {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Championships
          </CardTitle>
        </CardHeader>
        <CardContent>
          {championships.length === 0 ? (
            <p className="text-sm text-muted-foreground">No championships yet.</p>
          ) : (
            <ul className="space-y-3">
              {championships.map((c) => {
                const row = c.final_standings.find((r) => r.user_id === userId)
                return (
                  <li key={c.pool_id} className="flex items-center justify-between gap-3">
                    <div>
                      <Link href={`/pools/${c.pool_id}`} className="text-sm font-medium hover:underline">
                        {c.pools?.name ?? 'Pool'}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {gameName(c.game_type)} · {c.season_year}
                        {row?.detail ? ` · ${row.detail}` : ''}
                      </p>
                    </div>
                    <Badge variant="secondary">Champion</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pools</CardTitle>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not in any pools yet.</p>
          ) : (
            <ul className="space-y-3">
              {memberships.map((m) => (
                <li key={m.pool_id} className="flex items-center justify-between gap-3">
                  <Link href={`/pools/${m.pools!.id}`} className="text-sm font-medium hover:underline">
                    {m.pools!.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {gameName(m.pools!.game_type)} · {m.pools!.season_year}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
