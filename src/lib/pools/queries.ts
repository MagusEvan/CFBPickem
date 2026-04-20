import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Pool, PoolMember, Profile } from '@/lib/types'

export async function getPool(poolId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pools')
    .select('*')
    .eq('id', poolId)
    .single()
  if (error) return null
  return data as Pool
}

export async function getPoolMembers(poolId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pool_members')
    .select('*, profiles(*)')
    .eq('pool_id', poolId)
    .order('draft_position', { ascending: true, nullsFirst: false })
  return (data ?? []) as (PoolMember & { profiles: Profile })[]
}

export async function getPoolByInviteCode(inviteCode: string) {
  // Use admin client to bypass RLS — the user isn't a member yet
  const admin = createAdminClient()
  const { data } = await admin
    .from('pools')
    .select('*')
    .eq('invite_code', inviteCode)
    .single()
  return data as Pool | null
}

export async function getCurrentUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
