import { notFound } from 'next/navigation'
import { NavBarServer } from '@/components/nav-bar-server'
import { requireSiteAdmin } from '@/lib/admin/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireSiteAdmin()
  if ('error' in auth) notFound()

  return (
    <>
      <NavBarServer />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  )
}
