'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { nanoid } from 'nanoid'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const DEFAULT_CONFERENCES = [
  'ACC', 'B12', 'B1G', 'SEC', 'AAC', 'CUSA', 'MAC', 'MW', 'SBC', 'PAC12_IND'
]

const createPoolSchema = z.object({
  name: z.string().min(1).max(100),
  season_year: z.number().int().min(2024).max(2030),
  max_managers: z.number().int().min(4).max(16),
  conferences: z.array(z.string()).min(1).max(15),
  draft_order_mode: z.enum(['manual', 'random']),
})

export async function createPool(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const input = createPoolSchema.parse({
    name: formData.get('name'),
    season_year: Number(formData.get('season_year')),
    max_managers: Number(formData.get('max_managers')),
    conferences: formData.getAll('conferences'),
    draft_order_mode: formData.get('draft_order_mode') || 'random',
  })

  const inviteCode = nanoid(8)

  const { data: pool, error } = await supabase
    .from('pools')
    .insert({
      name: input.name,
      admin_id: user.id,
      season_year: input.season_year,
      invite_code: inviteCode,
      max_managers: input.max_managers,
      conferences: input.conferences,
      num_rounds: input.conferences.length,
      draft_order_mode: input.draft_order_mode,
    })
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

  // Look up pool by invite code
  const { data: pool, error: poolError } = await supabase
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

export async function getDefaultConferences() {
  return DEFAULT_CONFERENCES
}
