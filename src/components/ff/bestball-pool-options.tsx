'use client'

// Best ball league options: format (total vs h2h), draft, season (h2h only),
// plus collapsible starting-lineup and scoring sections. Controlled component
// shared between pool creation (step 2) and the pool settings page.

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScoringSettingsForm } from './scoring-settings-form'
import { bestBallStarters } from '@/lib/ff/settings'
import type { FFBestBallSettings, FFScoringSettings } from '@/lib/ff/types'

const SLOT_LABELS: Array<{ key: keyof FFBestBallSettings['roster']; label: string }> = [
  { key: 'QB', label: 'QB' },
  { key: 'RB', label: 'RB' },
  { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' },
  { key: 'FLEX', label: 'FLEX' },
  { key: 'K', label: 'K' },
  { key: 'DST', label: 'D/ST' },
]

const FLEX_OPTIONS = ['QB', 'RB', 'WR', 'TE'] as const

export function BestBallPoolOptions({
  settings,
  scoring,
  onSettingsChange,
  onScoringChange,
  structureLocked = false,
}: {
  settings: FFBestBallSettings
  scoring: FFScoringSettings
  onSettingsChange: (next: FFBestBallSettings) => void
  onScoringChange: (next: FFScoringSettings) => void
  /** Format, roster, roster size, and draft type lock once the draft starts */
  structureLocked?: boolean
}) {
  const [showRoster, setShowRoster] = useState(false)
  const [showScoring, setShowScoring] = useState(false)

  const starters = bestBallStarters(settings.roster)
  const rosterTooSmall = settings.totalRosterSize < starters

  function patch<K extends keyof FFBestBallSettings>(
    key: K,
    partial: Partial<FFBestBallSettings[K]>
  ) {
    onSettingsChange({
      ...settings,
      [key]: { ...(settings[key] as object), ...partial },
    })
  }

  return (
    <div className="space-y-6">
      {/* Format */}
      <div className="space-y-2">
        <Label>Format</Label>
        <div className="space-y-2">
          {([
            {
              value: 'total',
              label: 'Total points',
              hint: 'Season-long leaderboard — highest cumulative points wins',
            },
            {
              value: 'h2h',
              label: 'Head-to-head',
              hint: 'Weekly matchups with a playoff bracket',
            },
          ] as const).map((opt) => (
            <label key={opt.value} className="flex items-start gap-2">
              <input
                type="radio"
                checked={settings.format === opt.value}
                onChange={() => onSettingsChange({ ...settings, format: opt.value })}
                disabled={structureLocked}
                className="mt-1"
              />
              <span className="text-sm">
                {opt.label}
                <span className="block text-xs text-muted-foreground">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Draft */}
      <div className="space-y-2">
        <Label>Draft Type</Label>
        <div className="flex gap-4">
          {(['snake', 'auction'] as const).map((type) => (
            <label key={type} className="flex items-center gap-2">
              <input
                type="radio"
                checked={settings.draft.type === type}
                onChange={() => patch('draft', { type })}
                disabled={structureLocked}
              />
              <span className="text-sm capitalize">{type}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="bb-timer-enabled"
            checked={settings.draft.timerSeconds !== null}
            onChange={(e) => patch('draft', { timerSeconds: e.target.checked ? 90 : null })}
            className="accent-primary"
          />
          <Label htmlFor="bb-timer-enabled" className="text-sm font-normal">
            Pick timer
          </Label>
          {settings.draft.timerSeconds !== null && (
            <>
              <Input
                type="number"
                value={settings.draft.timerSeconds}
                onChange={(e) =>
                  patch('draft', { timerSeconds: Math.max(15, Number(e.target.value)) })
                }
                min={15}
                max={600}
                className="h-8 w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">seconds per pick</span>
            </>
          )}
        </div>
        {settings.draft.timerSeconds === null && (
          <p className="text-xs text-muted-foreground">
            Untimed — the draft waits for each manager to pick.
          </p>
        )}

        {settings.draft.type === 'auction' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Auction budget ($)</Label>
              <Input
                type="number"
                value={settings.draft.auctionBudget}
                onChange={(e) =>
                  patch('draft', { auctionBudget: Math.max(1, Number(e.target.value)) })
                }
                min={1}
                max={1000}
                disabled={structureLocked}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Bid clock (seconds)</Label>
              <Input
                type="number"
                value={settings.draft.auctionBidSeconds}
                onChange={(e) =>
                  patch('draft', { auctionBidSeconds: Math.max(5, Number(e.target.value)) })
                }
                min={5}
                max={120}
                className="h-8 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Roster size */}
      <div className="space-y-2">
        <Label htmlFor="bb-roster-size">Roster Size</Label>
        <div className="flex items-center gap-2">
          <Input
            id="bb-roster-size"
            type="number"
            value={settings.totalRosterSize}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                totalRosterSize: Math.max(1, Math.min(30, Number(e.target.value))),
              })
            }
            min={starters}
            max={30}
            disabled={structureLocked}
            className="h-8 w-24 text-sm"
          />
          <span className="text-xs text-muted-foreground">
            players per manager = {settings.draft.type === 'snake' ? `${settings.totalRosterSize} draft rounds` : 'roster spots to fill at auction'}
          </span>
        </div>
        {rosterTooSmall && (
          <p className="text-xs text-red-600">
            Roster size must be at least {starters} (the number of starting slots).
          </p>
        )}
      </div>

      {/* Season */}
      <div className="space-y-2">
        <Label>Season</Label>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {settings.format === 'h2h' ? 'Regular season weeks' : 'Scoring weeks'}
            </Label>
            <Input
              type="number"
              value={settings.season.regularSeasonWeeks}
              onChange={(e) => {
                const weeks = Math.min(17, Math.max(1, Number(e.target.value)))
                onSettingsChange({
                  ...settings,
                  season: { ...settings.season, regularSeasonWeeks: weeks, playoffStartWeek: weeks + 1 },
                })
              }}
              min={1}
              max={17}
              className="h-8 text-sm"
            />
          </div>
          {settings.format === 'h2h' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Playoff teams</Label>
                <select
                  value={settings.season.playoffTeams}
                  onChange={(e) =>
                    patch('season', { playoffTeams: Number(e.target.value) as 2 | 4 | 6 | 8 })
                  }
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
                  value={settings.season.playoffStartWeek}
                  onChange={(e) =>
                    patch('season', { playoffStartWeek: Math.max(2, Number(e.target.value)) })
                  }
                  min={2}
                  max={18}
                  className="h-8 text-sm"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Starting lineup (collapsible) */}
      <CollapsibleSection
        title={`Starting Lineup${structureLocked ? ' (locked after draft)' : ''}`}
        open={showRoster}
        onToggle={() => setShowRoster(!showRoster)}
      >
        <BestBallRosterForm value={settings} onChange={onSettingsChange} disabled={structureLocked} />
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

function BestBallRosterForm({
  value,
  onChange,
  disabled,
}: {
  value: FFBestBallSettings
  onChange: (next: FFBestBallSettings) => void
  disabled?: boolean
}) {
  function setSlot(key: keyof FFBestBallSettings['roster'], count: number) {
    onChange({ ...value, roster: { ...value.roster, [key]: count } })
  }

  function toggleFlex(pos: 'QB' | 'RB' | 'WR' | 'TE') {
    const has = value.flexEligible.includes(pos)
    const next = has
      ? value.flexEligible.filter((p) => p !== pos)
      : [...value.flexEligible, pos]
    if (next.length === 0) return // at least one flex-eligible position
    onChange({ ...value, flexEligible: next })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Your best lineup fills these slots automatically each week — everyone else on the
        roster just doesn&apos;t count that week.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {SLOT_LABELS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Input
              type="number"
              value={value.roster[key]}
              onChange={(e) => setSlot(key, Math.max(0, Number(e.target.value)))}
              min={0}
              max={12}
              disabled={disabled}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>
      {value.roster.FLEX > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">FLEX eligible positions</Label>
          <div className="flex gap-4">
            {FLEX_OPTIONS.map((pos) => (
              <label key={pos} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.flexEligible.includes(pos)}
                  onChange={() => toggleFlex(pos)}
                  disabled={disabled}
                  className="accent-primary"
                />
                {pos}
              </label>
            ))}
          </div>
        </div>
      )}
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
