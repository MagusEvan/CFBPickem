'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { nanoid } from 'nanoid'
import { redirect } from 'next/navigation'
import { isGameType } from '@/lib/games/registry'
import { GAME_SERVERS } from '@/lib/games/server'

export async function createPool(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const gameType = formData.get('game_type')
  if (!isGameType(gameType)) throw new Error('Invalid game type')

  const poolInsert = {
    ...GAME_SERVERS[gameType].parsePoolInsert(formData),
    admin_id: user.id,
    invite_code: nanoid(8),
  }

  const { data: pool, error } = await supabase
    .from('pools')
    .insert(poolInsert)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Auto-join the admin as the first member
  await supabase.from('pool_members').insert({
    pool_id: pool.id,
    user_id: user.id,
    draft_position: 1,
  })

  redirect(`/pools/${pool.id}`)
}

export async function joinPool(inviteCode: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Use admin client to bypass RLS — user isn't a member yet
  const admin = createAdminClient()
  const { data: pool, error: poolError } = await admin
    .from('pools')
    .select('id, max_managers, draft_status')
    .eq('invite_code', inviteCode)
    .single()

  if (poolError || !pool) throw new Error('Invalid invite code')
  if (pool.draft_status !== 'pre_draft') throw new Error('This pool has already started drafting')

  // Check if already a member
  const { data: existing } = await supabase
    .from('pool_members')
    .select('id')
    .eq('pool_id', pool.id)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    redirect(`/pools/${pool.id}`)
  }

  // Check member count
  const { count } = await supabase
    .from('pool_members')
    .select('*', { count: 'exact', head: true })
    .eq('pool_id', pool.id)

  if ((count ?? 0) >= pool.max_managers) throw new Error('This pool is full')

  // Join
  const { error } = await supabase.from('pool_members').insert({
    pool_id: pool.id,
    user_id: user.id,
  })

  if (error) throw new Error(error.message)

  redirect(`/pools/${pool.id}`)
}

export async function deletePool(poolId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify the caller is the pool admin
  const admin = createAdminClient()
  const { data: pool } = await admin
    .from('pools')
    .select('admin_id')
    .eq('id', poolId)
    .single()

  if (!pool) return { error: 'Pool not found' }
  if (pool.admin_id !== user.id) return { error: 'Only the pool admin can delete this pool' }

  // CASCADE on FK constraints handles pool_members, draft_picks, draft_state,
  // team_scraps, wc_scraps_teams automatically
  const { error } = await admin.from('pools').delete().eq('id', poolId)
  if (error) return { error: error.message }

  redirect('/pools')
}
