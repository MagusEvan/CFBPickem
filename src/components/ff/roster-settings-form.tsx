'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FFLeagueSettings } from '@/lib/ff/types'

const SLOT_LABELS: Array<{ key: keyof FFLeagueSettings['roster']; label: string }> = [
  { key: 'QB', label: 'QB' },
  { key: 'RB', label: 'RB' },
  { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' },
  { key: 'FLEX', label: 'FLEX' },
  { key: 'K', label: 'K' },
  { key: 'DST', label: 'D/ST' },
  { key: 'BENCH', label: 'Bench' },
  { key: 'IR', label: 'IR' },
]

const FLEX_OPTIONS = ['RB', 'WR', 'TE'] as const

export function RosterSettingsForm({
  value,
  onChange,
  disabled,
}: {
  value: FFLeagueSettings
  onChange: (next: FFLeagueSettings) => void
  disabled?: boolean
}) {
  function setSlot(key: keyof FFLeagueSettings['roster'], count: number) {
    onChange({ ...value, roster: { ...value.roster, [key]: count } })
  }

  function toggleFlex(pos: 'RB' | 'WR' | 'TE') {
    const has = value.flexEligible.includes(pos)
    const next = has
      ? value.flexEligible.filter((p) => p !== pos)
      : [...value.flexEligible, pos]
    if (next.length === 0) return // at least one flex-eligible position
    onChange({ ...value, flexEligible: next })
  }

  return (
    <div className="space-y-4">
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
