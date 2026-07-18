import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_MAX_ACTIVE_POOLS = 3

/**
 * A pool is "active" for limit purposes when the user is its admin and its
 * season hasn't aged out (season_year >= current calendar year).
 */
export async function countActivePools(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('pools')
    .select('id', { count: 'exact', head: true })
    .eq('admin_id', userId)
    .gte('season_year', new Date().getFullYear())
  return count ?? 0
}

export async function getGlobalPoolLimit(): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'max_active_pools_per_user')
    .single()
  const value = Number(data?.value)
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MAX_ACTIVE_POOLS
}

/**
 * Effective pool-creation limit for a user: per-user override if set,
 * otherwise the global default from app_settings.
 * (Future monetization: paid entitlements would be added here.)
 */
export async function getEffectivePoolLimit(userId: string): Promise<number> {
  const admin = createAdminClient()
  const [{ data: profile }, globalLimit] = await Promise.all([
    admin.from('profiles').select('pool_limit_override').eq('id', userId).single(),
    getGlobalPoolLimit(),
  ])
  return profile?.pool_limit_override ?? globalLimit
}
