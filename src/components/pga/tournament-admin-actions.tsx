'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  deleteTournament,
  refreshTournamentField,
  updateTournamentDraftOrder,
} from '@/lib/pga/actions'

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

export function TournamentDraftOrderCard({
  tournamentId,
  poolId,
  initialMode,
  members,
}: {
  tournamentId: string
  poolId: string
  initialMode: 'random' | 'manual'
  members: Array<{ id: string; name: string; position: number | null }>
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'random' | 'manual'>(initialMode)
  const [positions, setPositions] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const m of members) if (m.position !== null) init[m.id] = m.position
    return init
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const assigned = members.map((m) => positions[m.id])
  const manualValid =
    assigned.every((p) => Number.isInteger(p) && p >= 1 && p <= members.length) &&
    new Set(assigned).size === members.length

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateTournamentDraftOrder(
        tournamentId,
        poolId,
        mode,
        mode === 'manual' ? positions : undefined
      )
      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft Order</CardTitle>
        <CardDescription>
          Random shuffles the order when the draft starts; manual uses the positions you set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="tournament_draft_order_mode"
              value="random"
              checked={mode === 'random'}
              onChange={() => setMode('random')}
            />
            <span className="text-sm">Random</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="tournament_draft_order_mode"
              value="manual"
              checked={mode === 'manual'}
              onChange={() => setMode('manual')}
            />
            <span className="text-sm">Manual</span>
          </label>
        </div>
        {mode === 'manual' && (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <Input
                  type="number"
                  value={positions[m.id] ?? ''}
                  onChange={(e) =>
                    setPositions((p) => ({ ...p, [m.id]: Number(e.target.value) }))
                  }
                  min={1}
                  max={members.length}
                  placeholder="#"
                  className="h-8 w-16"
                />
                <Label className="font-normal">{m.name}</Label>
              </div>
            ))}
            {!manualValid && (
              <p className="text-xs text-red-600">
                Assign each participant a unique position from 1 to {members.length}.
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-green-700">Draft order saved</p>}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSave}
          disabled={isPending || (mode === 'manual' && !manualValid)}
        >
          {isPending && <Spinner className="mr-2" />}
          {isPending ? 'Saving...' : 'Save Draft Order'}
        </Button>
      </CardFooter>
    </Card>
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
