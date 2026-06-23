import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPool, getCurrentUserId } from '@/lib/pools/queries'
import { getTournaments } from '@/lib/pga/queries'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Flag, Plus, ArrowLeft } from 'lucide-react'

export const revalidate = 60

export default async function TournamentsPage({
  params,
}: {
  params: Promise<{ poolId: string }>
}) {
  const { poolId } = await params
  const [pool, tournaments, userId] = await Promise.all([
    getPool(poolId),
    getTournaments(poolId),
    getCurrentUserId(),
  ])

  if (!pool || pool.game_type !== 'pga') notFound()

  const isAdmin = pool.admin_id === userId

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/pools/${poolId}`}
          className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to League
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tournaments</h1>
          <p className="text-muted-foreground">{pool.name}</p>
        </div>
        {isAdmin && (
          <Link
            href={`/pools/${poolId}/tournaments/new`}
            className={buttonVariants()}
          >
            <Plus className="mr-1 h-4 w-4" /> New Tournament
          </Link>
        )}
      </div>

      {tournaments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Flag className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">No tournaments yet</p>
            {isAdmin && (
              <p className="mt-1 text-sm">Create your first tournament to get started.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tournaments.map((t) => (
            <Link key={t.id} href={`/pools/${poolId}/tournaments/${t.id}`}>
              <Card className="py-0 transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between px-4 py-4">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.start_date
                        ? new Date(t.start_date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : `${t.season_year}`}
                      {t.end_date && (
                        <>
                          {' — '}
                          {new Date(t.end_date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </>
                      )}
                      {' · '}{t.golfers_per_manager} golfers/mgr · Top {t.top_n_scoring}
                    </p>
                  </div>
                  <Badge
                    variant={t.draft_status === 'completed' ? 'secondary' : 'outline'}
                  >
                    {t.draft_status === 'pre_draft' && 'Pre-Draft'}
                    {t.draft_status === 'in_progress' && 'Drafting'}
                    {t.draft_status === 'completed' && 'Active'}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
