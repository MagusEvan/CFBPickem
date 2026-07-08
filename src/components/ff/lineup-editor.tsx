'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { swapFfLineupSlots } from '@/lib/ff/actions'
import { eligiblePositionsForSlot } from '@/lib/ff/roster'
import { isStarterSlot } from '@/lib/ff/scoring'
import type { FFLineupSlot, FFPlayer, FFLeagueSettings } from '@/lib/ff/types'

/**
 * Selection-based lineup editing: tap a slot, then tap another to swap the
 * two players (server re-validates eligibility + game locks).
 */
export function LineupEditor({
  poolId,
  slots,
  playersById,
  pointsByPlayer,
  lockedPlayerIds,
  settings,
  canEdit,
}: {
  poolId: string
  slots: FFLineupSlot[]
  playersById: Record<string, FFPlayer>
  pointsByPlayer: Record<string, number>
  lockedPlayerIds: string[]
  settings: FFLeagueSettings
  canEdit: boolean
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const locked = new Set(lockedPlayerIds)

  const selected = slots.find((s) => s.id === selectedId) ?? null

  const isValidTarget = (slot: FFLineupSlot): boolean => {
    if (!selected || slot.id === selected.id) return false
    const a = selected.player_id ? playersById[selected.player_id] : null
    const b = slot.player_id ? playersById[slot.player_id] : null
    if (!a && !b) return false
    if (a && (locked.has(a.id) || !eligiblePositionsForSlot(slot.slot, settings).includes(a.position))) return false
    if (b && (locked.has(b.id) || !eligiblePositionsForSlot(selected.slot, settings).includes(b.position))) return false
    return true
  }

  const handleClick = async (slot: FFLineupSlot) => {
    if (!canEdit || pending) return
    if (!selected) {
      // Can't move a locked or empty slot's player anywhere — but an empty
      // slot is a fine selection (moving someone INTO it)
      if (slot.player_id && locked.has(slot.player_id)) {
        toast.error('That player\u2019s game has already started')
        return
      }
      setSelectedId(slot.id)
      return
    }
    if (slot.id === selected.id) {
      setSelectedId(null)
      return
    }
    if (!isValidTarget(slot)) {
      toast.error('Invalid swap for those slots')
      return
    }
    setPending(true)
    const result = await swapFfLineupSlots(poolId, selected.id, slot.id)
    setPending(false)
    setSelectedId(null)
    if (result.error) toast.error(result.error)
    else router.refresh()
  }

  const renderRow = (slot: FFLineupSlot) => {
    const player = slot.player_id ? playersById[slot.player_id] : null
    const isLocked = player ? locked.has(player.id) : false
    const isSelected = slot.id === selectedId
    const validTarget = selected !== null && isValidTarget(slot)

    return (
      <button
        key={slot.id}
        type="button"
        disabled={!canEdit || pending}
        onClick={() => handleClick(slot)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
          canEdit && 'hover:bg-muted/50',
          isSelected && 'border-primary ring-1 ring-primary',
          selected && !isSelected && validTarget && 'border-primary/50 bg-primary/5',
          selected && !isSelected && !validTarget && 'opacity-40'
        )}
      >
        <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">
          {slot.slot}
        </span>
        {player ? (
          <>
            {player.headshot_url && (
              <Image
                src={player.headshot_url}
                alt={player.name}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
              />
            )}
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{player.name}</span>{' '}
              <span className="text-xs text-muted-foreground">
                {player.position} · {player.nfl_team_abbrev ?? 'FA'}
                {player.injury_status && ` · ${player.injury_status}`}
              </span>
            </span>
            {isLocked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="w-14 shrink-0 text-right font-mono text-sm tabular-nums">
              {(pointsByPlayer[player.id] ?? 0).toFixed(2)}
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">Empty</span>
        )}
      </button>
    )
  }

  const starters = slots.filter((s) => isStarterSlot(s.slot))
  const bench = slots.filter((s) => !isStarterSlot(s.slot))

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">{starters.map(renderRow)}</div>
      {bench.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
            Bench
          </h3>
          <div className="space-y-1.5">{bench.map(renderRow)}</div>
        </div>
      )}
      {canEdit && (
        <p className="text-xs text-muted-foreground">
          {selected ? 'Tap another slot to swap.' : 'Tap a slot to start a swap.'}
        </p>
      )}
    </div>
  )
}
