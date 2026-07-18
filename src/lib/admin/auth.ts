import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Verify the current user is a site admin (profiles.is_site_admin).
 * Returns a service-role client on success, or an error string.
 */
export async function requireSiteAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('is_site_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_site_admin) return { error: 'Site admin access required' as const }
  return { admin, userId: user.id }
}
