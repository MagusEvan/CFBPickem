'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function DeletePoolButton({
  poolId,
  poolName,
  deleteAction,
}: {
  poolId: string
  poolName: string
  deleteAction: (poolId: string) => Promise<{ error?: string }>
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'confirm' | 'type'>(  'confirm')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setStep('confirm')
    setTyped('')
    setError(null)
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAction(poolId)
      if (result.error) {
        setError(result.error)
      }
      // On success the action redirects, so no need to close
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) reset()
      }}
    >
      <DialogTrigger
        render={<Button variant="destructive" className="w-full" />}
      >
        Delete Pool
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete &ldquo;{poolName}&rdquo;?</DialogTitle>
              <DialogDescription>
                This will permanently delete the pool, all draft picks, standings,
                and member data. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setStep('type')}>
                Yes, delete this pool
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Type &ldquo;delete&rdquo; to confirm</DialogTitle>
              <DialogDescription>
                This is permanent. Type <strong>delete</strong> below to confirm.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              placeholder="delete"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                setError(null)
              }}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={typed !== 'delete' || isPending}
                onClick={handleDelete}
              >
                {isPending ? 'Deleting…' : 'Delete forever'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
