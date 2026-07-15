'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { deleteTournament, refreshTournamentField } from '@/lib/pga/actions'

export function RefreshFieldButton({
  tournamentId,
  poolId,
}: {
  tournamentId: string
  poolId: string
}) {
  const router = useRouter()
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRefresh() {
    setMessage(null)
    startTransition(async () => {
      const result = await refreshTournamentField(tournamentId, poolId)
      if (result.error) {
        setMessage({ text: result.error, isError: true })
      } else if (result.count === 0) {
        setMessage({
          text: "ESPN hasn't published this field yet — try again closer to the tournament.",
          isError: false,
        })
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <p className={`text-xs ${message.isError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </p>
      )}
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
        {isPending && <Spinner className="mr-2" />}
        {isPending ? 'Refreshing…' : 'Refresh Field'}
      </Button>
    </div>
  )
}

export function DeleteTournamentButton({
  tournamentId,
  poolId,
  tournamentName,
}: {
  tournamentId: string
  poolId: string
  tournamentName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteTournament(tournamentId, poolId)
      if (result.error) {
        setError(result.error)
      } else {
        router.push(`/pools/${poolId}/tournaments`)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setError(null)
      }}
    >
      <DialogTrigger render={<Button variant="destructive" />}>
        Delete Tournament
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{tournamentName}&rdquo;?</DialogTitle>
          <DialogDescription>
            This permanently deletes the tournament, including its golfer field,
            draft results, and all picks. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending ? 'Deleting…' : 'Delete forever'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
