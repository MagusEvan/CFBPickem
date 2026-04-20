import { notFound, redirect } from 'next/navigation'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

export default async function PoolSettingsPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()
  if (pool.admin_id !== userId) redirect(`/pools/${poolId}`)

  async function updatePool(formData: FormData) {
    'use server'
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const name = formData.get('name') as string
    const maxManagers = Number(formData.get('max_managers'))

    await supabase
      .from('pools')
      .update({ name, max_managers: maxManagers })
      .eq('id', poolId)

    redirect(`/pools/${poolId}`)
  }

  async function updateDraftOrder(formData: FormData) {
    'use server'
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    for (const member of members) {
      const position = Number(formData.get(`position-${member.id}`))
      if (position) {
        await admin
          .from('pool_members')
          .update({ draft_position: position })
          .eq('id', member.id)
      }
    }

    redirect(`/pools/${poolId}`)
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Pool Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <form action={updatePool}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Pool Name</Label>
              <Input id="name" name="name" defaultValue={pool.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_managers">Max Managers</Label>
              <Input
                id="max_managers"
                name="max_managers"
                type="number"
                defaultValue={pool.max_managers}
                min={Math.max(4, members.length)}
                max={16}
              />
            </div>
            <div className="space-y-2">
              <Label>Conferences</Label>
              <div className="flex flex-wrap gap-1">
                {(pool.conferences as string[]).map((conf) => (
                  <Badge key={conf} variant="secondary">{conf}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit">Save Changes</Button>
          </CardFooter>
        </form>
      </Card>

      {pool.draft_status === 'pre_draft' && pool.draft_order_mode === 'manual' && (
        <Card>
          <CardHeader>
            <CardTitle>Draft Order</CardTitle>
            <CardDescription>Set the draft position for each manager</CardDescription>
          </CardHeader>
          <form action={updateDraftOrder}>
            <CardContent className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-4">
                  <Input
                    name={`position-${member.id}`}
                    type="number"
                    defaultValue={member.draft_position ?? ''}
                    min={1}
                    max={members.length}
                    className="w-16"
                  />
                  <span>{member.profiles.display_name}</span>
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <Button type="submit">Save Draft Order</Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  )
}
