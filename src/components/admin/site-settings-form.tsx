'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { updateMaxActivePools } from '@/lib/admin/actions'

export function SiteSettingsForm({ initialMaxPools }: { initialMaxPools: number }) {
  const [maxPools, setMaxPools] = useState(String(initialMaxPools))
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setMessage(null)
    startTransition(async () => {
      const result = await updateMaxActivePools(Number(maxPools))
      setMessage(
        result.error
          ? { text: result.error, isError: true }
          : { text: 'Saved', isError: false }
      )
    })
  }

  return (
    <div className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="max-pools">Max active pools per user</Label>
        <Input
          id="max-pools"
          type="number"
          min={0}
          max={100}
          value={maxPools}
          onChange={(e) => setMaxPools(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Counts pools a user admins in the current season or later. Site admins are
          exempt; per-user overrides on the Users page take precedence.
        </p>
      </div>
      {message && (
        <p className={`text-sm ${message.isError ? 'text-destructive' : 'text-green-700'}`}>
          {message.text}
        </p>
      )}
      <Button onClick={handleSave} disabled={isPending}>
        {isPending && <Spinner className="mr-2" />}
        {isPending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
