import { notFound } from 'next/navigation'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPool, getPoolMembers, getCurrentUserId } from '@/lib/pools/queries'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DeletePoolButton } from '@/components/pool/delete-pool'
import { deletePool } from '@/lib/pools/actions'
import type { WorldCupScoringConfig } from '@/lib/types'

export const revalidate = 300

export default async function PoolSettingsPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  const [pool, members, userId] = await Promise.all([
    getPool(poolId),
    getPoolMembers(poolId),
    getCurrentUserId(),
  ])

  if (!pool) notFound()

  const isAdmin = pool.admin_id === userId
  const isWorldCup = pool.game_type === 'world_cup'

  async function updatePool(formData: FormData) {
    'use server'
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const name = formData.get('name') as string
    const maxManagers = Number(formData.get('max_managers'))
    const bgColor = (formData.get('bg_color') as string) || null
    const fontColor = (formData.get('font_color') as string) || null
    const subfontColor = (formData.get('subfont_color') as string) || null

    await supabase
      .from('pools')
      .update({ name, max_managers: maxManagers, bg_color: bgColor, font_color: fontColor, subfont_color: subfontColor })
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pool Settings</h1>
        <Link href={`/pools/${poolId}`} className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}>
          &lt; Return to Pool
        </Link>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        {isAdmin ? (
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
                <Label>Pool Card Colors</Label>
                <p className="text-xs text-muted-foreground">Shown on the My Pools page</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="bg_color" className="text-xs text-muted-foreground">Background</Label>
                    <input
                      id="bg_color"
                      name="bg_color"
                      type="color"
                      defaultValue={pool.bg_color || '#ffffff'}
                      className="h-9 w-14 cursor-pointer rounded border border-input p-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="font_color" className="text-xs text-muted-foreground">Title</Label>
                    <input
                      id="font_color"
                      name="font_color"
                      type="color"
                      defaultValue={pool.font_color || '#000000'}
                      className="h-9 w-14 cursor-pointer rounded border border-input p-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="subfont_color" className="text-xs text-muted-foreground">Subtitle</Label>
                    <input
                      id="subfont_color"
                      name="subfont_color"
                      type="color"
                      defaultValue={pool.subfont_color || '#737373'}
                      className="h-9 w-14 cursor-pointer rounded border border-input p-1"
                    />
                  </div>
                </div>
              </div>
              <PoolInfoFields pool={pool} isWorldCup={isWorldCup} />
            </CardContent>
            <CardFooter>
              <Button type="submit">Save Changes</Button>
            </CardFooter>
          </form>
        ) : (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Pool Name</Label>
              <p className="text-sm">{pool.name}</p>
            </div>
            <div className="space-y-2">
              <Label>Max Managers</Label>
              <p className="text-sm">{pool.max_managers}</p>
            </div>
            <PoolInfoFields pool={pool} isWorldCup={isWorldCup} />
          </CardContent>
        )}
      </Card>

      {/* World Cup Scoring Config */}
      {isWorldCup && (
        <Card>
          <CardHeader>
            <CardTitle>Scoring Settings</CardTitle>
            <CardDescription>
              {isAdmin ? 'Adjust point values for each stage' : 'Point values for each stage'}
            </CardDescription>
          </CardHeader>
          {isAdmin ? (
            <form action={updateScoringConfig}>
              <CardContent className="space-y-6">
                <ScoringSection label="Group Stage" config={scoringConfig.group} prefix="group" readOnly={false} />
                <KnockoutScoringSection config={scoringConfig.knockout} readOnly={false} />
              </CardContent>
              <CardFooter>
                <Button type="submit">Save Scoring</Button>
              </CardFooter>
            </form>
          ) : (
            <CardContent className="space-y-6">
              <ScoringSection label="Group Stage" config={scoringConfig.group} prefix="group" readOnly />
              <KnockoutScoringSection config={scoringConfig.knockout} readOnly />
            </CardContent>
          )}
        </Card>
      )}

      {/* Draft Order (admin only, pre-draft only) */}
      {isAdmin && pool.draft_status === 'pre_draft' && pool.draft_order_mode === 'manual' && (
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

      {/* Danger Zone (admin only) */}
      {isAdmin && (
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
      )}
    </div>
  )
}

function PoolInfoFields({
  pool,
  isWorldCup,
}: {
  pool: { game_type: string; teams_per_manager: number | null; conferences: string[] | null }
  isWorldCup: boolean
}) {
  return (
    <>
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
    </>
  )
}

function ScoringSection({
  label,
  config,
  prefix,
  readOnly,
}: {
  label: string
  config: { win: number; draw: number; goal_points: number; goal_cap: number; shutout: number }
  prefix: string
  readOnly: boolean
}) {
  const fields = [
    { label: 'Win', name: `${prefix}_win`, value: config.win },
    { label: 'Draw', name: `${prefix}_draw`, value: config.draw },
    { label: 'Points per goal', name: `${prefix}_goal_points`, value: config.goal_points },
    { label: 'Goal cap', name: `${prefix}_goal_cap`, value: config.goal_cap },
    { label: 'Shutout', name: `${prefix}_shutout`, value: config.shutout },
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <ScoringField key={f.name} label={f.label} name={f.name} value={f.value} readOnly={readOnly} />
        ))}
      </div>
    </div>
  )
}

function KnockoutScoringSection({
  config,
  readOnly,
}: {
  config: WorldCupScoringConfig['knockout']
  readOnly: boolean
}) {
  const fields = [
    { label: 'Outright win', name: 'knockout_win', value: config.win },
    { label: 'OT win', name: 'knockout_ot_win', value: config.ot_win },
    { label: 'Shootout win', name: 'knockout_shootout_win', value: config.shootout_win },
    { label: 'Shootout loss', name: 'knockout_shootout_loss', value: config.shootout_loss },
    { label: 'OT loss', name: 'knockout_ot_loss', value: config.ot_loss },
    { label: 'Outright loss', name: 'knockout_loss', value: config.loss },
    { label: 'Points per goal', name: 'knockout_goal_points', value: config.goal_points },
    { label: 'Shutout', name: 'knockout_shutout', value: config.shutout },
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Knockout Rounds</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <ScoringField key={f.name} label={f.label} name={f.name} value={f.value} readOnly={readOnly} />
        ))}
      </div>
    </div>
  )
}

function ScoringField({
  label,
  name,
  value,
  readOnly,
}: {
  label: string
  name: string
  value: number
  readOnly: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground" htmlFor={name}>{label}</Label>
      {readOnly ? (
        <p className="h-8 text-sm leading-8">{value}</p>
      ) : (
        <Input
          id={name}
          name={name}
          type="number"
          defaultValue={value}
          min={0}
          max={20}
          className="h-8 text-sm"
        />
      )}
    </div>
  )
}
