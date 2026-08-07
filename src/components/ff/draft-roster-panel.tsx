'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { autoFillLineup } from '@/lib/ff/roster'
import type { FFDraftPick, FFLeagueSettings, FFPlayer, FFSlot } from '@/lib/ff/types'

const SLOT_LABEL: Record<FFSlot, string> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  FLEX: 'FLEX',
  K: 'K',
  DST: 'D/ST',
  BENCH: 'BN',
  IR: 'IR',
}

/**
 * The drafted roster laid into the slots this pool's settings define.
 *
 * Slot assignment reuses autoFillLineup over the member's picks in draft
 * order — the same call completeDraft makes when it writes the real week-1
 * lineup — so what a manager sees mid-draft is what they'll actually get.
 */
export function DraftRosterPanel({
  picks,
  playersById,
  byeWeeks,
  settings,
  totalRounds,
  isBestBall,
  emptyLabel = 'No picks yet.',
}: {
  /** This member's picks, in draft order */
  picks: FFDraftPick[]
  playersById: Map<string, FFPlayer>
  /** team_id -> regular-season bye week */
  byeWeeks: Record<string, number>
  settings: FFLeagueSettings
  totalRounds: number
  isBestBall: boolean
  emptyLabel?: string
}) {
  const assignments = autoFillLineup(
    picks.map((p) => ({ id: p.player_id, position: p.player_position })),
    settings
  )
  const pickByPlayerId = new Map(picks.map((p) => [p.player_id, p]))

  // IR is never populated during a draft, so it would only add empty noise
  const starters = assignments.filter((a) => a.slot !== 'BENCH' && a.slot !== 'IR')
  const bench = assignments.filter((a) => a.slot === 'BENCH')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {picks.length} of {totalRounds} roster spots filled
        </span>
        {picks.length === totalRounds && <Badge variant="secondary">Roster complete</Badge>}
      </div>

      {picks.length === 0 && <p className="text-sm text-muted-foreground">{emptyLabel}</p>}

      <SlotGroup
        heading={isBestBall ? 'Lineup Slots' : 'Starters'}
        note={
          isBestBall
            ? 'Best ball scores your optimal lineup automatically each week — this is the slot template, not a locked lineup.'
            : undefined
        }
        assignments={starters}
        playersById={playersById}
        byeWeeks={byeWeeks}
        pickByPlayerId={pickByPlayerId}
      />

      {bench.length > 0 && (
        <SlotGroup
          heading="Bench"
          assignments={bench}
          playersById={playersById}
          byeWeeks={byeWeeks}
          pickByPlayerId={pickByPlayerId}
        />
      )}
    </div>
  )
}

function SlotGroup({
  heading,
  note,
  assignments,
  playersById,
  byeWeeks,
  pickByPlayerId,
}: {
  heading: string
  note?: string
  assignments: Array<{ slot: FFSlot; slot_index: number; player_id: string | null }>
  playersById: Map<string, FFPlayer>
  byeWeeks: Record<string, number>
  pickByPlayerId: Map<string, FFDraftPick>
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {heading}
      </h3>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <ul className="space-y-1">
        {assignments.map((a) => {
          const player = a.player_id ? playersById.get(a.player_id) : null
          const pick = a.player_id ? pickByPlayerId.get(a.player_id) : null
          return (
            <li
              key={`${a.slot}-${a.slot_index}`}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                a.player_id ? 'border-border' : 'border-dashed border-border/60'
              }`}
            >
              <span className="w-10 shrink-0 text-center text-[11px] font-semibold text-muted-foreground">
                {SLOT_LABEL[a.slot]}
              </span>
              {player ? (
                <>
                  {player.headshot_url ? (
                    <Image
                      src={player.headshot_url}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0 rounded-full bg-muted object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="h-6 w-6 shrink-0 rounded-full bg-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {player.position} · {player.nfl_team_abbrev ?? 'FA'}
                    {player.nfl_team_id != null &&
                      byeWeeks[player.nfl_team_id] != null &&
                      ` · Bye ${byeWeeks[player.nfl_team_id]}`}
                  </span>
                  {pick?.price != null ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      ${pick.price}
                    </Badge>
                  ) : pick?.round != null ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      R{pick.round}
                    </Badge>
                  ) : null}
                </>
              ) : (
                <span className="flex-1 text-sm text-muted-foreground">Empty</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
