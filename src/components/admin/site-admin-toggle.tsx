'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { setSiteAdmin } from '@/lib/admin/actions'

export function SiteAdminToggle({
  userId,
  isAdmin,
  isSelf,
}: {
  userId: string
  isAdmin: boolean
  /** The current admin's own row — revoking yourself is blocked server-side */
  isSelf: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    setError(null)
    startTransition(async () => {
      const result = await setSiteAdmin(userId, !isAdmin)
      if (result.error) setError(result.error)
    })
  }

  if (isSelf) {
    return <span className="text-xs text-muted-foreground">You</span>
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" variant={isAdmin ? 'destructive' : 'outline'} onClick={toggle} disabled={isPending}>
        {isPending ? <Spinner /> : isAdmin ? 'Revoke admin' : 'Make admin'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
