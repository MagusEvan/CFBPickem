'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function FinalizeSeasonButton({
  poolId,
  poolName,
  alreadyFinalized,
  finalizeAction,
}: {
  poolId: string
  poolName: string
  alreadyFinalized: boolean
  finalizeAction: (poolId: string) => Promise<{ error?: string }>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleFinalize() {
    startTransition(async () => {
      const result = await finalizeAction(poolId)
      if (result.error) {
        setError(result.error)
      } else {
        setDone(true)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setError(null)
          setDone(false)
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>
        {alreadyFinalized ? 'Re-Finalize Season' : 'Finalize Season'}
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Season finalized</DialogTitle>
              <DialogDescription>
                The final standings for &ldquo;{poolName}&rdquo; have been recorded.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Finalize &ldquo;{poolName}&rdquo;?</DialogTitle>
              <DialogDescription>
                This snapshots the current standings as the official final results and
                records the champion on member profiles.
                {alreadyFinalized && ' This pool was already finalized — finalizing again overwrites the previous snapshot.'}
              </DialogDescription>
            </DialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={isPending} onClick={handleFinalize}>
                {isPending ? 'Finalizing…' : 'Finalize Season'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
