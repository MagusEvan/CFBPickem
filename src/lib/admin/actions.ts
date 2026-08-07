'use server'

import { revalidatePath } from 'next/cache'
import { requireSiteAdmin } from '@/lib/admin/auth'

/** Set the global default for max active pools per user. */
export async function updateMaxActivePools(limit: number): Promise<{ error?: string }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }

  if (!Number.isInteger(limit) || limit < 0 || limit > 100) {
    return { error: 'Limit must be a whole number between 0 and 100' }
  }

  const { error } = await auth.admin
    .from('app_settings')
    .upsert({ key: 'max_active_pools_per_user', value: limit, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }

  revalidatePath('/admin/settings')
  return {}
}

/** Grant or revoke the site-admin flag. Self-demotion is blocked (lockout). */
export async function setSiteAdmin(
  userId: string,
  isAdmin: boolean
): Promise<{ error?: string }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }

  if (!isAdmin && userId === auth.userId) {
    return { error: 'You cannot remove your own admin access' }
  }

  const { error } = await auth.admin
    .from('profiles')
    .update({ is_site_admin: isAdmin })
    .eq('id', userId)
  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return {}
}

/** Set (or clear with null) a per-user pool-creation limit override. */
export async function setUserPoolLimit(
  userId: string,
  limit: number | null
): Promise<{ error?: string }> {
  const auth = await requireSiteAdmin()
  if ('error' in auth) return { error: auth.error }

  if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 100)) {
    return { error: 'Limit must be a whole number between 0 and 100, or empty for default' }
  }

  const { error } = await auth.admin
    .from('profiles')
    .update({ pool_limit_override: limit })
    .eq('id', userId)
  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return {}
}
