// Server wrapper for the client NavBar: resolves is_site_admin so the Site
// Admin menu entry renders without a client-side profile fetch on every page.

import { createClient } from '@/lib/supabase/server'
import { NavBar } from './nav-bar'

export async function NavBarServer() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isSiteAdmin = false
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('is_site_admin')
      .eq('id', user.id)
      .maybeSingle()
    isSiteAdmin = data?.is_site_admin === true
  }

  return <NavBar isSiteAdmin={isSiteAdmin} />
}
