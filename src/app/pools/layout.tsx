import { NavBarServer } from '@/components/nav-bar-server'
import { PresenceHeartbeat } from '@/components/presence-heartbeat'

export default function PoolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBarServer />
      <PresenceHeartbeat />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  )
}
