'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { setUserPoolLimit } from '@/lib/admin/actions'

export function UserLimitEditor({
  userId,
  initialOverride,
}: {
  userId: string
  initialOverride: number | null
}) {
  const [value, setValue] = useState(initialOverride === null ? '' : String(initialOverride))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty = value !== (initialOverride === null ? '' : String(initialOverride))

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await setUserPoolLimit(userId, value === '' ? null : Number(value))
      if (result.error) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        type="number"
        min={0}
        max={100}
        value={value}
        placeholder="default"
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        className="h-8 w-20"
      />
      {(dirty || isPending) && (
        <Button size="sm" variant="outline" onClick={handleSave} disabled={isPending}>
          {isPending ? <Spinner /> : 'Save'}
        </Button>
      )}
      {saved && !dirty && <span className="text-xs text-green-700">✓</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
