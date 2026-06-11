import { notFound, redirect } from 'next/navigation'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DeletePoolButton } from '@/components/pool/delete-pool'
import { deletePool } from '@/lib/pools/actions'
import type { WorldCupScoringConfig } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  knockout: 'Knockout Rounds',
}

export default async function PoolSettingsPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()
  if (pool.admin_id !== userId) redirect(`/pools/${poolId}`)

  const isWorldCup = pool.game_type === 'world_cup'

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

  async function updateScoringConfig(formData: FormData) {
    'use server'
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const config: WorldCupScoringConfig = {
      group: {
        win: Number(formData.get('group_win')),
        draw: Number(formData.get('group_draw')),
        goal_points: Number(formData.get('group_goal_points')),
        goal_cap: Number(formData.get('group_goal_cap')),
        shutout: Number(formData.get('group_shutout')),
      },
      knockout: {
        win: Number(formData.get('knockout_win')),
        ot_win: Number(formData.get('knockout_ot_win')),
        shootout_win: Number(formData.get('knockout_shootout_win')),
        shootout_loss: Number(formData.get('knockout_shootout_loss')),
        ot_loss: Number(formData.get('knockout_ot_loss')),
        loss: Number(formData.get('knockout_loss')),
        goal_points: Number(formData.get('knockout_goal_points')),
        goal_cap: null,
        shutout: Number(formData.get('knockout_shutout')),
      },
    }

    await supabase
      .from('pools')
      .update({ scoring_config: config })
      .eq('id', poolId)

    redirect(`/pools/${poolId}`)
  }

  const scoringConfig = (pool.scoring_config ?? {
    group: { win: 6, draw: 3, goal_points: 1, goal_cap: 3, shutout: 1 },
    knockout: { win: 6, ot_win: 5, shootout_win: 4, shootout_loss: 2, ot_loss: 1, loss: 0, goal_points: 1, goal_cap: null, shutout: 1 },
  }) as WorldCupScoringConfig

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
                min={Math.max(2, members.length)}
                max={isWorldCup ? 48 : 16}
              />
            </div>
            <div className="space-y-2">
              <Label>Game Type</Label>
              <Badge variant="secondary">{isWorldCup ? 'World Cup' : 'College Football'}</Badge>
            </div>
            {isWorldCup && (
              <div className="space-y-2">
                <Label>Teams per Manager</Label>
                <p className="text-sm text-muted-foreground">{pool.teams_per_manager}</p>
              </div>
            )}
            {!isWorldCup && (
              <div className="space-y-2">
                <Label>Conferences</Label>
                <div className="flex flex-wrap gap-1">
                  {((pool.conferences ?? []) as string[]).map((conf) => (
                    <Badge key={conf} variant="secondary">{conf}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit">Save Changes</Button>
          </CardFooter>
        </form>
      </Card>

      {/* World Cup Scoring Config */}
      {isWorldCup && (
        <Card>
          <CardHeader>
            <CardTitle>Scoring Settings</CardTitle>
            <CardDescription>Adjust point values for each stage</CardDescription>
          </CardHeader>
          <form action={updateScoringConfig}>
            <CardContent className="space-y-6">
              {/* Group Stage */}
              <div className="space-y-3">
                <p className="text-sm font-semibold">Group Stage</p>
                <div className="grid grid-cols-2 gap-3">
                  <ScoringInput label="Win" name="group_win" defaultValue={scoringConfig.group.win} />
                  <ScoringInput label="Draw" name="group_draw" defaultValue={scoringConfig.group.draw} />
                  <ScoringInput label="Points per goal" name="group_goal_points" defaultValue={scoringConfig.group.goal_points} />
                  <ScoringInput label="Goal cap" name="group_goal_cap" defaultValue={scoringConfig.group.goal_cap} />
                  <ScoringInput label="Shutout" name="group_shutout" defaultValue={scoringConfig.group.shutout} />
                </div>
              </div>

              {/* Knockout */}
              <div className="space-y-3">
                <p className="text-sm font-semibold">Knockout Rounds</p>
                <div className="grid grid-cols-2 gap-3">
                  <ScoringInput label="Outright win" name="knockout_win" defaultValue={scoringConfig.knockout.win} />
                  <ScoringInput label="OT win" name="knockout_ot_win" defaultValue={scoringConfig.knockout.ot_win} />
                  <ScoringInput label="Shootout win" name="knockout_shootout_win" defaultValue={scoringConfig.knockout.shootout_win} />
                  <ScoringInput label="Shootout loss" name="knockout_shootout_loss" defaultValue={scoringConfig.knockout.shootout_loss} />
                  <ScoringInput label="OT loss" name="knockout_ot_loss" defaultValue={scoringConfig.knockout.ot_loss} />
                  <ScoringInput label="Outright loss" name="knockout_loss" defaultValue={scoringConfig.knockout.loss} />
                  <ScoringInput label="Points per goal" name="knockout_goal_points" defaultValue={scoringConfig.knockout.goal_points} />
                  <ScoringInput label="Shutout" name="knockout_shutout" defaultValue={scoringConfig.knockout.shutout} />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit">Save Scoring</Button>
            </CardFooter>
          </form>
        </Card>
      )}

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

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete this pool and all associated data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeletePoolButton poolId={poolId} poolName={pool.name} deleteAction={deletePool} />
        </CardContent>
      </Card>
    </div>
  )
}

function ScoringInput({
  label,
  name,
  defaultValue,
}: {
  label: string
  name: string
  defaultValue: number
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground" htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        defaultValue={defaultValue}
        min={0}
        max={20}
        className="h-8 text-sm"
      />
    </div>
  )
}
