import { notFound } from 'next/navigation'
import { NavBar } from '@/components/nav-bar'
import { requireSiteAdmin } from '@/lib/admin/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireSiteAdmin()
  if ('error' in auth) notFound()

  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  )
}
