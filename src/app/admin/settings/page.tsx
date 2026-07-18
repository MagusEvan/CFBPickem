import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { getGlobalPoolLimit } from '@/lib/pools/limits'
import { SiteSettingsForm } from '@/components/admin/site-settings-form'

export default async function AdminSettingsPage() {
  const maxPools = await getGlobalPoolLimit()

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className={`${buttonVariants({ variant: 'outline' })} border-foreground/25`}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Admin
      </Link>
      <h1 className="text-2xl font-bold">Site Settings</h1>
      <SiteSettingsForm initialMaxPools={maxPools} />
    </div>
  )
}
