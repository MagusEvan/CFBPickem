import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { UserLimitEditor } from '@/components/admin/user-limit-editor'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const admin = createAdminClient()

  let query = admin
    .from('profiles')
    .select('id, display_name, created_at, is_site_admin, pool_limit_override')
    .order('created_at', { ascending: false })
    .limit(200)
  if (q) query = query.ilike('display_name', `%${q}%`)
  const { data: profiles } = await query

  // Active pool counts (current season or later) per admin
  const { data: pools } = await admin
    .from('pools')
    .select('admin_id')
    .gte('season_year', new Date().getFullYear())
  const poolCounts = new Map<string, number>()
  for (const p of pools ?? []) {
    poolCounts.set(p.admin_id, (poolCounts.get(p.admin_id) ?? 0) + 1)
  }

  // Emails come from auth.users, not profiles
  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map(authUsers?.users.map((u) => [u.id, u.email]) ?? [])

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Admin
      </Link>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Users ({profiles?.length ?? 0})</h1>
        <form className="w-56">
          <Input name="q" placeholder="Search by name…" defaultValue={q ?? ''} />
        </form>
      </div>

      <Card>
        <CardContent className="overflow-x-auto py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-2 py-2 font-normal">User</th>
                <th className="px-2 py-2 font-normal">Joined</th>
                <th className="px-2 py-2 text-center font-normal">Active pools</th>
                <th className="px-2 py-2 text-right font-normal">Pool limit override</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="px-2 py-2">
                    <span className="font-medium">{p.display_name || '—'}</span>
                    {p.is_site_admin && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">Admin</Badge>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {emailById.get(p.id) ?? ''}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">
                    {poolCounts.get(p.id) ?? 0}
                  </td>
                  <td className="px-2 py-2">
                    <UserLimitEditor userId={p.id} initialOverride={p.pool_limit_override} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
