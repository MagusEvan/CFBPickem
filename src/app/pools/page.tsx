import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus } from 'lucide-react'
import type { Pool, PoolMember } from '@/lib/types'
import { getGame } from '@/lib/games/registry'

export const revalidate = 60

export default async function PoolsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get pools the user is a member of
  const { data: memberships } = await supabase
    .from('pool_members')
    .select('pool_id')
    .eq('user_id', user!.id)

  const poolIds = memberships?.map((m: { pool_id: string }) => m.pool_id) ?? []

  let pools: Pool[] = []
  if (poolIds.length > 0) {
    const { data } = await supabase
      .from('pools')
      .select('*')
      .in('id', poolIds)
      .order('created_at', { ascending: false })
    pools = (data as Pool[]) ?? []
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Pools</h1>
        <Link href="/pools/new" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          Create Pool
        </Link>
      </div>

      {pools.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-muted-foreground">You haven&apos;t joined any pools yet.</p>
            <Link href="/pools/new" className={buttonVariants()}>
              Create Your First Pool
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pools.map((pool) => (
            <Link key={pool.id} href={`/pools/${pool.id}`}>
              <Card
                className="transition-colors hover:bg-muted/50"
                style={{
                  ...(pool.bg_color ? { backgroundColor: pool.bg_color } : {}),
                  ...(pool.border_color ? { borderColor: pool.border_color } : {}),
                }}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle
                      className="text-lg"
                      style={pool.font_color ? { color: pool.font_color } : undefined}
                    >
                      {pool.name}
                    </CardTitle>
                    {pool.game_type !== 'pga' && (
                      <DraftStatusBadge status={pool.draft_status} />
                    )}
                  </div>
                  <CardDescription
                    style={pool.subfont_color ? { color: pool.subfont_color } : undefined}
                  >
                    {getGame(pool.game_type).poolLabel(pool.season_year)} &middot; {pool.max_managers} managers
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function DraftStatusBadge({ status }: { status: Pool['draft_status'] }) {
  const variants: Record<Pool['draft_status'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    pre_draft: { label: 'Pre-Draft', variant: 'outline' },
    in_progress: { label: 'Drafting', variant: 'default' },
    completed: { label: 'In-Season', variant: 'secondary' },
  }
  const { label, variant } = variants[status]
  return <Badge variant={variant}>{label}</Badge>
}
