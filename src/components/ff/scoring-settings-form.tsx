'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_FF_SCORING_SETTINGS } from '@/lib/ff/settings'
import type { FFScoringSettings } from '@/lib/ff/types'

type ScalarKey = Exclude<keyof FFScoringSettings, 'dst'>
type DstScalarKey = Exclude<keyof FFScoringSettings['dst'], 'pointsAllowedTiers'>

const SECTIONS: Array<{ title: string; fields: Array<{ key: ScalarKey; label: string }> }> = [
  {
    title: 'Passing',
    fields: [
      { key: 'passYdsPerPoint', label: 'Yards per point' },
      { key: 'passTd', label: 'Passing TD' },
      { key: 'passInt', label: 'Interception' },
      { key: 'pass2pt', label: '2-pt conversion' },
    ],
  },
  {
    title: 'Rushing',
    fields: [
      { key: 'rushYdsPerPoint', label: 'Yards per point' },
      { key: 'rushTd', label: 'Rushing TD' },
      { key: 'rush2pt', label: '2-pt conversion' },
    ],
  },
  {
    title: 'Receiving',
    fields: [
      { key: 'reception', label: 'Reception (PPR)' },
      { key: 'recYdsPerPoint', label: 'Yards per point' },
      { key: 'recTd', label: 'Receiving TD' },
      { key: 'rec2pt', label: '2-pt conversion' },
    ],
  },
  {
    title: 'Miscellaneous',
    fields: [{ key: 'fumbleLost', label: 'Fumble lost' }],
  },
  {
    title: 'Kicking',
    fields: [
      { key: 'fg0to39', label: 'FG 0–39' },
      { key: 'fg40to49', label: 'FG 40–49' },
      { key: 'fg50plus', label: 'FG 50+' },
      { key: 'fgMiss', label: 'FG miss' },
      { key: 'xp', label: 'Extra point' },
      { key: 'xpMiss', label: 'XP miss' },
    ],
  },
]

const DST_FIELDS: Array<{ key: DstScalarKey; label: string }> = [
  { key: 'sack', label: 'Sack' },
  { key: 'interception', label: 'Interception' },
  { key: 'fumbleRecovery', label: 'Fumble recovery' },
  { key: 'td', label: 'Defensive TD' },
  { key: 'safety', label: 'Safety' },
  { key: 'blockedKick', label: 'Blocked kick' },
]

function tierLabel(tier: { max: number | null }, index: number, tiers: Array<{ max: number | null }>): string {
  if (tier.max === 0) return '0 points allowed'
  const prev = index > 0 ? tiers[index - 1].max : null
  const lower = prev === null ? 0 : prev + 1
  return tier.max === null ? `${lower}+ allowed` : `${lower}–${tier.max} allowed`
}

export function ScoringSettingsForm({
  value,
  onChange,
  disabled,
}: {
  value: FFScoringSettings
  onChange: (next: FFScoringSettings) => void
  disabled?: boolean
}) {
  function setScalar(key: ScalarKey, v: number) {
    onChange({ ...value, [key]: v })
  }

  function setDst(key: DstScalarKey, v: number) {
    onChange({ ...value, dst: { ...value.dst, [key]: v } })
  }

  function setTierPoints(index: number, points: number) {
    const tiers = value.dst.pointsAllowedTiers.map((t, i) => (i === index ? { ...t, points } : t))
    onChange({ ...value, dst: { ...value.dst, pointsAllowedTiers: tiers } })
  }

  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => (
        <div key={section.title} className="space-y-2">
          <p className="text-sm font-semibold">{section.title}</p>
          <div className="grid grid-cols-2 gap-3">
            {section.fields.map(({ key, label }) => (
              <NumberField
                key={key}
                label={label}
                value={value[key]}
                onChange={(v) => setScalar(key, v)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Defense / Special Teams</p>
        <div className="grid grid-cols-2 gap-3">
          {DST_FIELDS.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              value={value.dst[key]}
              onChange={(v) => setDst(key, v)}
              disabled={disabled}
            />
          ))}
        </div>
        <p className="text-xs font-medium text-muted-foreground">Points allowed</p>
        <div className="grid grid-cols-2 gap-3">
          {value.dst.pointsAllowedTiers.map((tier, i) => (
            <NumberField
              key={i}
              label={tierLabel(tier, i, value.dst.pointsAllowedTiers)}
              value={tier.points}
              onChange={(v) => setTierPoints(i, v)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FF_SCORING_SETTINGS)}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          Reset to defaults
        </button>
      )}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="0.5"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="h-8 text-sm"
      />
    </div>
  )
}
