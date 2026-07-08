'use client'

// FF league options: draft, season/playoffs, waivers, trades, plus
// collapsible roster and scoring sections. Controlled component shared
// between pool creation (step 2) and the pool settings page.

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RosterSettingsForm } from './roster-settings-form'
import { ScoringSettingsForm } from './scoring-settings-form'
import type { FFLeagueSettings, FFScoringSettings } from '@/lib/ff/types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function FfPoolOptions({
  league,
  scoring,
  onLeagueChange,
  onScoringChange,
  rosterLocked = false,
}: {
  league: FFLeagueSettings
  scoring: FFScoringSettings
  onLeagueChange: (next: FFLeagueSettings) => void
  onScoringChange: (next: FFScoringSettings) => void
  /** Roster shape and draft type can't change once the draft has started */
  rosterLocked?: boolean
}) {
  const [showRoster, setShowRoster] = useState(false)
  const [showScoring, setShowScoring] = useState(false)

  function patch<K extends keyof FFLeagueSettings>(key: K, partial: Partial<FFLeagueSettings[K]>) {
    onLeagueChange({ ...league, [key]: { ...league[key], ...partial } })
  }

  return (
    <div className="space-y-6">
      {/* Draft */}
      <div className="space-y-2">
        <Label>Draft Type</Label>
        <div className="flex gap-4">
          {(['snake', 'auction'] as const).map((type) => (
            <label key={type} className="flex items-center gap-2">
              <input
                type="radio"
                checked={league.draft.type === type}
                onChange={() => patch('draft', { type })}
                disabled={rosterLocked}
              />
              <span className="text-sm capitalize">{type}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="ff-timer-enabled"
            checked={league.draft.timerSeconds !== null}
            onChange={(e) => patch('draft', { timerSeconds: e.target.checked ? 90 : null })}
            className="accent-primary"
          />
          <Label htmlFor="ff-timer-enabled" className="text-sm font-normal">
            Pick timer
          </Label>
          {league.draft.timerSeconds !== null && (
            <>
              <Input
                type="number"
                value={league.draft.timerSeconds}
                onChange={(e) => patch('draft', { timerSeconds: Math.max(15, Number(e.target.value)) })}
                min={15}
                max={600}
                className="h-8 w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">seconds per pick</span>
            </>
          )}
        </div>
        {league.draft.timerSeconds === null && (
          <p className="text-xs text-muted-foreground">
            Untimed — the draft waits for each manager to pick.
          </p>
        )}

        {league.draft.type === 'auction' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Auction budget ($)</Label>
              <Input
                type="number"
                value={league.draft.auctionBudget}
                onChange={(e) => patch('draft', { auctionBudget: Math.max(1, Number(e.target.value)) })}
                min={1}
                max={1000}
                disabled={rosterLocked}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Bid clock (seconds)</Label>
              <Input
                type="number"
                value={league.draft.auctionBidSeconds}
                onChange={(e) => patch('draft', { auctionBidSeconds: Math.max(5, Number(e.target.value)) })}
                min={5}
                max={120}
                className="h-8 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Season & playoffs */}
      <div className="space-y-2">
        <Label>Season</Label>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Regular season weeks</Label>
            <Input
              type="number"
              value={league.season.regularSeasonWeeks}
              onChange={(e) => {
                const weeks = Math.min(17, Math.max(1, Number(e.target.value)))
                onLeagueChange({
                  ...league,
                  season: { ...league.season, regularSeasonWeeks: weeks, playoffStartWeek: weeks + 1 },
                })
              }}
              min={1}
              max={17}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Playoff teams</Label>
            <select
              value={league.season.playoffTeams}
              onChange={(e) => patch('season', { playoffTeams: Number(e.target.value) as 2 | 4 | 6 | 8 })}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {[2, 4, 6, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Playoffs start week</Label>
            <Input
              type="number"
              value={league.season.playoffStartWeek}
              onChange={(e) => patch('season', { playoffStartWeek: Math.max(2, Number(e.target.value)) })}
              min={2}
              max={18}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Waivers */}
      <div className="space-y-2">
        <Label>Waivers</Label>
        <div className="flex gap-4">
          {([
            { value: 'faab', label: 'FAAB budget' },
            { value: 'priority', label: 'Priority order' },
            { value: 'none', label: 'None' },
          ] as const).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2">
              <input
                type="radio"
                checked={league.waivers.type === opt.value}
                onChange={() => patch('waivers', { type: opt.value })}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
        {league.waivers.type !== 'none' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            {league.waivers.type === 'faab' && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">FAAB budget ($)</Label>
                <Input
                  type="number"
                  value={league.waivers.faabBudget}
                  onChange={(e) => patch('waivers', { faabBudget: Math.max(0, Number(e.target.value)) })}
                  min={0}
                  max={1000}
                  className="h-8 text-sm"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Claims process on</Label>
              <select
                value={league.waivers.processDay}
                onChange={(e) => patch('waivers', { processDay: Number(e.target.value) })}
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {DAYS.map((day, i) => (
                  <option key={day} value={i}>{day}s</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Trades */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="ff-trades-enabled"
            checked={league.trades.enabled}
            onChange={(e) => patch('trades', { enabled: e.target.checked })}
            className="accent-primary"
          />
          <Label htmlFor="ff-trades-enabled">Allow trades</Label>
        </div>
        {league.trades.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Trade deadline (week)</Label>
              <Input
                type="number"
                value={league.trades.deadlineWeek ?? ''}
                placeholder="None"
                onChange={(e) =>
                  patch('trades', { deadlineWeek: e.target.value === '' ? null : Number(e.target.value) })
                }
                min={1}
                max={18}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Trade review</Label>
              <select
                value={league.trades.review}
                onChange={(e) => patch('trades', { review: e.target.value as 'none' | 'commissioner' })}
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="none">No review</option>
                <option value="commissioner">Commissioner approves</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Roster (collapsible) */}
      <CollapsibleSection
        title={`Roster Settings${rosterLocked ? ' (locked after draft)' : ''}`}
        open={showRoster}
        onToggle={() => setShowRoster(!showRoster)}
      >
        <RosterSettingsForm value={league} onChange={onLeagueChange} disabled={rosterLocked} />
      </CollapsibleSection>

      {/* Scoring (collapsible) */}
      <CollapsibleSection
        title="Scoring Settings"
        open={showScoring}
        onToggle={() => setShowScoring(!showScoring)}
      >
        <ScoringSettingsForm value={scoring} onChange={onScoringChange} />
      </CollapsibleSection>
    </div>
  )
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-sm font-medium"
      >
        <span>{title}</span>
        <span className="text-xs text-muted-foreground">{open ? 'Hide' : 'Customize'}</span>
      </button>
      {open && <div className="rounded-md border p-4">{children}</div>}
    </div>
  )
}
